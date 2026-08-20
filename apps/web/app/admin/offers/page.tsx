"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { authedFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, Card, EmptyState, Input, LoadingState } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminSection
} from "@/components/admin/admin-shell";

type OfferSettings = {
  offer1ExternalEnabled: boolean;
  offer2EscrowEnabled: boolean;
  offer1CommissionBps: number;
  offer1CommissionFixedCfa: number;
  offer2RetentionBps: number;
  offer2PerVoteCommissionEnabled: boolean;
  offer2PerVoteCommissionBps: number;
  pspFeexpaySupportsSplit: boolean;
  pspFedapaySupportsSplit: boolean;
  pspKkiapaySupportsSplit: boolean;
  otpTtlSeconds: number;
  otpResendDelaySeconds: number;
};

type RevenueResponse = {
  byOfferType: {
    EXTERNAL: { commissionCfa: number; grossCfa: number; transactions: number };
    ESCROW: { commissionCfa: number; grossCfa: number; transactions: number };
  };
  totalCommissionCfa: number;
};

type FedaPaySubAccount = {
  id: string;
  slug: string;
  displayName: string;
  fedapaySubAccountRef: string;
  fedapaySubAccountSubmittedAt: string | null;
  fedapaySubAccountVerifiedAt: string | null;
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

export default function AdminOffersSettingsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [settings, setSettings] = useState<OfferSettings | null>(null);
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [subAccounts, setSubAccounts] = useState<FedaPaySubAccount[]>([]);
  const [verifyingTenantId, setVerifyingTenantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const [settingsRes, revenueRes, subAccountsRes] = await Promise.all([
      authedFetch<OfferSettings>("/admin/offers/settings"),
      authedFetch<RevenueResponse>("/admin/offers/revenue"),
      authedFetch<FedaPaySubAccount[]>("/admin/offers/fedapay-subaccounts")
    ]);
    setSettings(settingsRes);
    setRevenue(revenueRes);
    setSubAccounts(subAccountsRes);
  };

  const verifySubAccount = async (tenantId: string) => {
    setVerifyingTenantId(tenantId);
    try {
      await authedFetch(`/admin/offers/fedapay-subaccounts/${tenantId}/verify`, {
        method: "POST"
      });
      showToast.success(
        isEn ? "FedaPay sub-account verified." : "Sous-compte FedaPay validé."
      );
      await load();
    } catch (caught) {
      showToast.error(
        caught instanceof Error ? caught.message : isEn ? "Verification failed." : "Échec de la validation."
      );
    } finally {
      setVerifyingTenantId(null);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setError("");
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const updateField = <K extends keyof OfferSettings>(key: K, value: OfferSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setIsSaving(true);
    setSaved(false);
    try {
      const updated = await authedFetch<OfferSettings>("/admin/offers/settings", {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      setSettings(updated);
      setSaved(true);
      showToast.success(isEn ? "Offer settings saved." : "Paramètres d'offres enregistrés.");
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Save failed." : "Échec de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={5} label={isEn ? "Loading offers…" : "Chargement des offres…"} />;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Offers" : "Offres"}
        title={isEn ? "Offers & pricing" : "Offres & tarifs"}
        description={
          isEn
            ? "Enable offers, set commissions (basis points) and PSP split flags."
            : "Activez les offres, définissez les commissions (points de base) et les flags de split PSP."
        }
      />

      <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-semibold text-amber-800">
          {isEn ? "Test phase — Escrow only" : "Phase de test — Escrow uniquement"}
        </p>
        <p className="mt-1 text-muted-foreground">
          {isEn
            ? "Offer 1 (External) is parked under review. Offer 2 (Escrow) is the live path. Use API_PAYMENT_DEMO_MODE=true locally; never in production."
            : "L'offre 1 (External) est en réflexion. L'offre 2 (Escrow) est le parcours actif. Utilisez API_PAYMENT_DEMO_MODE=true en local ; jamais en production."}
        </p>
      </Card>

      {error ? <AdminErrorAlert message={error} /> : null}

      {!settings && !error ? (
        <EmptyState
          title={isEn ? "No settings" : "Aucun paramètre"}
          description={isEn ? "Offer settings could not be loaded." : "Impossible de charger les paramètres d'offres."}
        />
      ) : null}

      {revenue ? (
        <AdminSection title={isEn ? "Revenue" : "Revenus"} description={isEn ? "Confirmed payments only." : "Paiements confirmés uniquement."}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">{isEn ? "Total commission" : "Commission totale"}</p>
              <p className="mt-1 text-2xl font-extrabold">{formatCfa(revenue.totalCommissionCfa, isEn)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">EXTERNAL</p>
              <p className="mt-1 text-xl font-bold">{formatCfa(revenue.byOfferType.EXTERNAL.commissionCfa, isEn)}</p>
              <p className="text-xs text-muted-foreground">
                {revenue.byOfferType.EXTERNAL.transactions} tx · {formatCfa(revenue.byOfferType.EXTERNAL.grossCfa, isEn)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">ESCROW</p>
              <p className="mt-1 text-xl font-bold">{formatCfa(revenue.byOfferType.ESCROW.commissionCfa, isEn)}</p>
              <p className="text-xs text-muted-foreground">
                {revenue.byOfferType.ESCROW.transactions} tx · {formatCfa(revenue.byOfferType.ESCROW.grossCfa, isEn)}
              </p>
            </Card>
          </div>
        </AdminSection>
      ) : null}

      <AdminSection
        title={isEn ? "FedaPay Marketplace accounts" : "Sous-comptes FedaPay Marketplace"}
        description={
          isEn
            ? "Verify only after checking the organizer's sub-account and KYC in FedaPay."
            : "Validez uniquement après vérification du sous-compte et du KYC dans FedaPay."
        }
      >
        {subAccounts.length === 0 ? (
          <EmptyState
            title={isEn ? "No submitted account" : "Aucun compte soumis"}
            description={
              isEn
                ? "External organizers have not submitted a FedaPay reference yet."
                : "Aucun organisateur External n'a encore soumis de référence FedaPay."
            }
          />
        ) : (
          <div className="space-y-3">
            {subAccounts.map((account) => (
              <Card
                key={account.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{account.displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    {account.fedapaySubAccountRef}
                  </p>
                </div>
                {account.fedapaySubAccountVerifiedAt ? (
                  <span className="text-sm font-medium text-emerald-600">
                    {isEn ? "Verified" : "Validé"}
                  </span>
                ) : (
                  <Button
                    type="button"
                    loading={verifyingTenantId === account.id}
                    onClick={() => void verifySubAccount(account.id)}
                  >
                    {isEn ? "Verify" : "Valider"}
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </AdminSection>

      {settings ? (
        <form onSubmit={onSave} className="space-y-8">
          <AdminSection title={isEn ? "Offer availability" : "Disponibilité des offres"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={settings.offer1ExternalEnabled}
                  onChange={(e) => updateField("offer1ExternalEnabled", e.target.checked)}
                  className="size-4"
                />
                <span>
                  <span className="block font-semibold">{isEn ? "Offer 1 — External" : "Offre 1 — External"}</span>
                  <span className="text-xs text-muted-foreground">
                    {isEn
                      ? "Parked under review (keep off during Escrow tests)"
                      : "En réflexion (garder désactivée pendant les tests Escrow)"}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={settings.offer2EscrowEnabled}
                  onChange={(e) => updateField("offer2EscrowEnabled", e.target.checked)}
                  className="size-4"
                />
                <span>
                  <span className="block font-semibold">{isEn ? "Offer 2 — Escrow" : "Offre 2 — Escrow"}</span>
                  <span className="text-xs text-muted-foreground">
                    {isEn ? "Encaissement plateforme" : "Encaissement plateforme"}
                  </span>
                </span>
              </label>
            </div>
          </AdminSection>

          <AdminSection
            title={isEn ? "External commission" : "Commission External"}
            description={isEn ? `Current: ${bpsToPercent(settings.offer1CommissionBps)}% + fixed` : `Actuel : ${bpsToPercent(settings.offer1CommissionBps)} % + fixe`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="offer1CommissionBps"
                label={isEn ? "Commission (bps)" : "Commission (bps)"}
                type="number"
                min={0}
                max={10000}
                value={String(settings.offer1CommissionBps)}
                onChange={(e) => updateField("offer1CommissionBps", Number.parseInt(e.target.value || "0", 10))}
                helpText={isEn ? "1000 bps = 10%" : "1000 bps = 10 %"}
              />
              <Input
                id="offer1CommissionFixedCfa"
                label={isEn ? "Fixed commission (CFA)" : "Commission fixe (FCFA)"}
                type="number"
                min={0}
                value={String(settings.offer1CommissionFixedCfa)}
                onChange={(e) => updateField("offer1CommissionFixedCfa", Number.parseInt(e.target.value || "0", 10))}
              />
            </div>
          </AdminSection>

          <AdminSection title={isEn ? "Escrow retention" : "Retenue Escrow"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="offer2RetentionBps"
                label={isEn ? "Retention on close (bps)" : "Retenue à la clôture (bps)"}
                type="number"
                min={0}
                max={10000}
                value={String(settings.offer2RetentionBps)}
                onChange={(e) => updateField("offer2RetentionBps", Number.parseInt(e.target.value || "0", 10))}
                helpText={isEn ? `= ${bpsToPercent(settings.offer2RetentionBps)}%` : `= ${bpsToPercent(settings.offer2RetentionBps)} %`}
              />
              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                <input
                  type="checkbox"
                  checked={settings.offer2PerVoteCommissionEnabled}
                  onChange={(e) => updateField("offer2PerVoteCommissionEnabled", e.target.checked)}
                  className="mt-1 size-4"
                />
                <span className="flex-1 space-y-2">
                  <span className="block font-semibold">
                    {isEn ? "Per-vote commission" : "Commission par vote"}
                  </span>
                  <Input
                    id="offer2PerVoteCommissionBps"
                    label={isEn ? "Per-vote bps" : "Bps par vote"}
                    type="number"
                    min={0}
                    max={10000}
                    value={String(settings.offer2PerVoteCommissionBps)}
                    onChange={(e) =>
                      updateField("offer2PerVoteCommissionBps", Number.parseInt(e.target.value || "0", 10))
                    }
                    disabled={!settings.offer2PerVoteCommissionEnabled}
                  />
                </span>
              </label>
            </div>
          </AdminSection>

          <AdminSection
            title={isEn ? "PSP split support" : "Support split PSP"}
            description={
              isEn
                ? "Only FedaPay Marketplace is validated for native split. Other providers stay locked."
                : "Seul FedaPay Marketplace est validé pour le split natif. Les autres PSP restent verrouillés."
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["pspFeexpaySupportsSplit", "FeexPay"],
                  ["pspFedapaySupportsSplit", "FedaPay"],
                  ["pspKkiapaySupportsSplit", "KkiaPay"]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border border-border p-4">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    disabled={key !== "pspFedapaySupportsSplit"}
                    onChange={(e) => updateField(key, e.target.checked)}
                    className="size-4 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="font-medium">{label}</span>
                </label>
              ))}
            </div>
          </AdminSection>

          <AdminSection
            title={isEn ? "Email OTP" : "OTP e-mail"}
            description={
              isEn
                ? "Validity and resend delay for verification / password reset codes."
                : "Durée de validité et délai de renvoi des codes de vérification / reset."
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="otpTtlSeconds"
                label={isEn ? "OTP TTL (seconds)" : "Validité OTP (secondes)"}
                type="number"
                min={60}
                max={3600}
                value={String(settings.otpTtlSeconds ?? 600)}
                onChange={(e) => updateField("otpTtlSeconds", Number.parseInt(e.target.value || "600", 10))}
              />
              <Input
                id="otpResendDelaySeconds"
                label={isEn ? "Resend delay (seconds)" : "Délai avant renvoi (secondes)"}
                type="number"
                min={10}
                max={600}
                value={String(settings.otpResendDelaySeconds ?? 60)}
                onChange={(e) =>
                  updateField("otpResendDelaySeconds", Number.parseInt(e.target.value || "60", 10))
                }
              />
            </div>
          </AdminSection>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={isSaving}>
              {isEn ? "Save settings" : "Enregistrer"}
            </Button>
            {saved ? (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                {isEn ? "Saved." : "Enregistré."}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </AdminPageShell>
  );
}
