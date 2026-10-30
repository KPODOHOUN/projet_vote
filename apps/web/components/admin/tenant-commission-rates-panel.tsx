"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { authedFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, FormError, Input, LoadingState } from "@/components/ui";

type CommissionRate = {
  id: string;
  bps: number;
  effectiveFrom: string;
  reason: string | null;
  createdByUserId: string;
  createdAt: string;
};

const percent = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} %`;

/**
 * Taux négocié d'un organisateur : historique complet (jamais modifié) et ajout
 * d'un nouveau taux à partir d'une date d'effet. Il s'applique aux contrats
 * signés après cette date ; les concours déjà publiés gardent le leur.
 */
export function TenantCommissionRatesPanel({ tenantId }: { tenantId: string }) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [rates, setRates] = useState<CommissionRate[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    authedFetch<CommissionRate[]>(`/admin/offers/tenants/${tenantId}/commission-rates`)
      .then(setRates)
      .catch((caught) => setLoadError(caught instanceof Error ? caught.message : isEn ? "Loading failed." : "Chargement impossible."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const value = Number(rate.trim().replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setFormError(isEn ? "Enter a percentage between 0 and 100." : "Saisissez un pourcentage entre 0 et 100.");
      return;
    }
    if (reason.trim().length < 3) {
      setFormError(isEn ? "Explain the agreement (reason)." : "Indiquez le motif de l'accord.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      await authedFetch(`/admin/offers/tenants/${tenantId}/commission-rates`, {
        method: "POST",
        body: JSON.stringify({
          bps: Math.round(value * 100),
          reason: reason.trim(),
          ...(effectiveFrom ? { effectiveFrom: new Date(effectiveFrom).toISOString() } : {})
        })
      });
      setRate("");
      setReason("");
      setEffectiveFrom("");
      showToast.success(isEn ? "Rate saved. The organizer is notified." : "Taux enregistré. L'organisateur est prévenu.");
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : isEn ? "Could not save." : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{isEn ? "Negotiated commission" : "Commission négociée"}</h3>
        <p className="text-xs text-muted-foreground">
          {isEn
            ? "Applies to contracts signed from its start date. Published contests keep their contract rate."
            : "S'applique aux contrats signés à partir de sa date d'effet. Les concours publiés gardent le taux de leur contrat."}
        </p>
      </div>
      {loadError ? <FormError>{loadError}</FormError> : null}
      {rates === null && !loadError ? <LoadingState variant="rows" count={1} label={isEn ? "Loading rates…" : "Chargement des taux…"} /> : null}
      {rates && rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{isEn ? "No negotiated rate: platform default applies." : "Aucun taux négocié : le taux par défaut s'applique."}</p>
      ) : null}
      {rates && rates.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {rates.map((item) => (
            <li key={item.id} className="rounded-md border border-border p-3">
              <span className="font-semibold">{percent(item.bps)}</span>{" "}
              <span className="text-muted-foreground">
                {isEn ? "from" : "à partir du"} {formatDateTime(item.effectiveFrom, locale)}
              </span>
              {item.reason ? <p className="text-xs text-muted-foreground">{item.reason}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Input id="tenant-rate" label={isEn ? "New rate (%)" : "Nouveau taux (%)"} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        <Input
          id="tenant-rate-from"
          label={isEn ? "Start date (empty = now)" : "Date d'effet (vide = maintenant)"}
          type="datetime-local"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
        <Input id="tenant-rate-reason" label={isEn ? "Reason" : "Motif"} value={reason} onChange={(e) => setReason(e.target.value)} />
        {formError ? <div className="sm:col-span-3"><FormError>{formError}</FormError></div> : null}
        <div className="sm:col-span-3">
          <Button type="submit" loading={saving} disabled={!rate.trim()}>
            {isEn ? "Save the rate" : "Enregistrer le taux"}
          </Button>
        </div>
      </form>
    </div>
  );
}
