"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { authLoginUrl } from "@/lib/auth-navigation";
import { authedFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, EmptyState, Input, LoadingState } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminSection,
  AdminStatGrid,
  AdminStatTile
} from "@/components/admin/admin-shell";

/** Règles d'argent de la plateforme (GET/PUT /admin/offers/settings) — source unique côté API. */
type FinanceSettings = {
  commissionDefaultBps: number;
  ticketCommissionBps: number;
  heldBps: number;
  heldReleaseDelayHours: number;
  otpTtlSeconds: number;
  otpResendDelaySeconds: number;
};

type PurposeRevenue = { grossCfa: number; commissionCfa: number; transactions: number };
type RevenueResponse = {
  byPurpose: Partial<Record<"VOTE" | "TICKET" | "ORGANIZER_VOTE_TOPUP", PurposeRevenue>>;
  totalGrossCfa: number;
  totalCommissionCfa: number;
};

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
}

// Saisie en pourcentage (« 10 » ou « 2,5 »), stockage en points de base côté API.
function percentToBps(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

type PercentFieldProps = {
  id: string;
  label: string;
  bps: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
};

// Garde le texte tapé (« 2, » en cours de saisie) tant qu'il correspond à la valeur.
function PercentField({ id, label, bps, onChange, disabled }: PercentFieldProps) {
  const [text, setText] = useState(bpsToPercent(bps));
  useEffect(() => {
    if (percentToBps(text) !== bps) setText(bpsToPercent(bps));
  }, [bps, text]);
  return (
    <Input
      id={id}
      label={label}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        onChange(percentToBps(e.target.value));
      }}
    />
  );
}

export default function AdminOffersSettingsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!getStoredToken()) {
      router.push(authLoginUrl());
      return;
    }
    setIsLoading(true);
    void Promise.all([
      authedFetch<FinanceSettings>("/admin/offers/settings"),
      authedFetch<RevenueResponse>("/admin/offers/revenue")
    ])
      .then(([loadedSettings, loadedRevenue]) => {
        setSettings(loadedSettings);
        setRevenue(loadedRevenue);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : isEn ? "Loading failed." : "Chargement impossible."))
      .finally(() => setIsLoading(false));
  }, [router, isEn]);

  const updateField = <K extends keyof FinanceSettings>(key: K, value: FinanceSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings || isSaving) return;
    setIsSaving(true);
    setSaved(false);
    try {
      const updated = await authedFetch<FinanceSettings>("/admin/offers/settings", {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      setSettings(updated);
      setSaved(true);
      showToast.success(isEn ? "Settings saved." : "Réglages enregistrés.");
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Save failed." : "Échec de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={5} label={isEn ? "Loading…" : "Chargement…"} />;
  }

  const panel = "rounded-xl border border-border bg-card p-4 sm:p-5";
  const purposeLabels: Array<["VOTE" | "TICKET" | "ORGANIZER_VOTE_TOPUP", string]> = [
    ["VOTE", isEn ? "Public votes" : "Votes du public"],
    ["TICKET", isEn ? "Tickets" : "Billets"],
    ["ORGANIZER_VOTE_TOPUP", isEn ? "Votes added by organizers" : "Votes ajoutés par les organisateurs"]
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Money" : "Argent"}
        title={isEn ? "Commission & reserve" : "Commission et réserve"}
        description={
          isEn
            ? "Rules applied to every confirmed payment and written into each new contest contract. A signed contract keeps its own rates."
            : "Règles appliquées à chaque paiement confirmé et reprises dans chaque nouveau contrat de concours. Un contrat signé garde ses propres taux."
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      {revenue ? (
        <AdminSection title={isEn ? "Revenue" : "Recettes"} description={isEn ? "Confirmed payments only." : "Paiements confirmés uniquement."}>
          <AdminStatGrid>
            <AdminStatTile
              label={isEn ? "SHADOMA commission" : "Commission SHADOMA"}
              value={formatCfa(revenue.totalCommissionCfa, isEn)}
              hint={`${isEn ? "on" : "sur"} ${formatCfa(revenue.totalGrossCfa, isEn)} ${isEn ? "collected" : "encaissés"}`}
            />
            {purposeLabels.map(([key, label]) => {
              const row = revenue.byPurpose[key] ?? { grossCfa: 0, commissionCfa: 0, transactions: 0 };
              return (
                <AdminStatTile
                  key={key}
                  label={label}
                  value={formatCfa(row.commissionCfa, isEn)}
                  hint={`${row.transactions} ${isEn ? "payments" : "paiements"} · ${formatCfa(row.grossCfa, isEn)}`}
                />
              );
            })}
          </AdminStatGrid>
        </AdminSection>
      ) : null}

      {!settings && !error ? (
        <EmptyState title={isEn ? "No settings" : "Aucun réglage"} description={isEn ? "Settings could not be loaded." : "Impossible de charger les réglages."} />
      ) : null}

      {settings ? (
        <form onSubmit={(e) => void onSave(e)} className="space-y-6">
          <AdminSection
            title={isEn ? "Platform rules" : "Règles de la plateforme"}
            description={
              isEn
                ? "Default vote commission for organizers without a negotiated rate (set per organizer from the user page), and the commission on every ticket sold. Both are frozen by each contest's contract when signed. Payment provider fees are included."
                : "Commission par défaut sur les votes des organisateurs sans taux négocié (à fixer par organisateur depuis la fiche utilisateur), et commission sur chaque billet vendu. Les deux sont figées par le contrat de chaque concours à sa signature. Les frais du prestataire sont inclus."
            }
          >
            <div className={`grid gap-4 sm:grid-cols-2 ${panel}`}>
              <PercentField
                id="commissionDefaultBps"
                label={isEn ? "Default commission (%)" : "Commission par défaut (%)"}
                bps={settings.commissionDefaultBps}
                onChange={(value) => updateField("commissionDefaultBps", value)}
              />
              <PercentField
                id="ticketCommissionBps"
                label={isEn ? "Commission on each ticket sold (%)" : "Commission sur chaque billet vendu (%)"}
                bps={settings.ticketCommissionBps}
                onChange={(value) => updateField("ticketCommissionBps", value)}
              />
              <PercentField
                id="heldBps"
                label={isEn ? "Reserve, share of the organizer's net (%)" : "Réserve, part du net de l'organisateur (%)"}
                bps={settings.heldBps}
                onChange={(value) => updateField("heldBps", value)}
              />
              <Input
                id="heldReleaseDelayHours"
                label={isEn ? "Reserve released after closing (hours)" : "Réserve libérée après la clôture (heures)"}
                type="number"
                min={0}
                value={String(settings.heldReleaseDelayHours)}
                onChange={(e) => updateField("heldReleaseDelayHours", Number.parseInt(e.target.value || "0", 10))}
              />
            </div>
          </AdminSection>

          <AdminSection title={isEn ? "Email codes" : "Codes envoyés par e-mail"}>
            <div className={`grid gap-4 sm:grid-cols-2 lg:max-w-2xl ${panel}`}>
              <Input
                id="otpTtlSeconds"
                label={isEn ? "Valid for (seconds)" : "Valable (secondes)"}
                type="number"
                min={60}
                max={3600}
                value={String(settings.otpTtlSeconds)}
                onChange={(e) => updateField("otpTtlSeconds", Number.parseInt(e.target.value || "600", 10))}
              />
              <Input
                id="otpResendDelaySeconds"
                label={isEn ? "Resend after (seconds)" : "Renvoi après (secondes)"}
                type="number"
                min={10}
                max={600}
                value={String(settings.otpResendDelaySeconds)}
                onChange={(e) => updateField("otpResendDelaySeconds", Number.parseInt(e.target.value || "60", 10))}
              />
            </div>
          </AdminSection>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            {saved ? (
              <span className="text-sm text-[var(--color-success-text)]" role="status">
                {isEn ? "Saved." : "Enregistré."}
              </span>
            ) : null}
            <Button type="submit" loading={isSaving}>
              {isEn ? "Save" : "Enregistrer"}
            </Button>
          </div>
        </form>
      ) : null}
    </AdminPageShell>
  );
}
