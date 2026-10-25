"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { authedFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, Card, FormError, Input, LoadingState } from "@/components/ui";
import type { MessageKey } from "@/lib/i18n";

type CommissionInfo = {
  enabled: boolean;
  effectiveBps: number;
  source: "event" | "tenant" | "default" | "disabled";
  eventBps: number | null;
  tenantBps: number | null;
  defaultBps: number;
  floorBps: number;
  ceilingBps: number;
  frozen: boolean;
};

function bpsToPercent(bps: number): string {
  return (bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Taux de commission Escrow d'un événement, côté admin. Les bornes viennent de
 * l'API (garde-fous serveur) ; le serveur refuse aussi toute modification après
 * l'activation, le champ n'est donc qu'un reflet de cette règle.
 */
export function EventCommissionPanel({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<CommissionInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void authedFetch<CommissionInfo>(`/admin/offers/events/${eventId}/commission`)
      .then(setInfo)
      .catch((caught) => setLoadError(caught instanceof Error ? caught.message : t("admin.commission.loadFailed")));
  }, [eventId, t]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    const normalized = value.trim().replace(",", ".");
    const percent = Number(normalized);
    if (normalized === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      setFieldError(t("admin.commission.invalid"));
      return;
    }
    setFieldError(undefined);
    setSaving(true);
    try {
      const commissionBps = Math.round(percent * 100);
      await authedFetch(`/admin/offers/events/${eventId}/commission`, {
        method: "PUT",
        body: JSON.stringify({ commissionBps }),
      });
      setInfo({ ...info, eventBps: commissionBps, effectiveBps: info.enabled ? commissionBps : 0, source: info.enabled ? "event" : "disabled" });
      setValue("");
      showToast.success(t("admin.commission.saved"));
    } catch (caught) {
      setFieldError(caught instanceof Error ? caught.message : t("admin.commission.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <FormError>{loadError}</FormError>;
  if (!info) return <LoadingState variant="rows" count={1} label={t("admin.commission.title")} />;

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-base font-bold">{t("admin.commission.title")}</h3>
        <p className="mt-1 text-2xl font-extrabold tabular-nums">
          {info.enabled ? `${bpsToPercent(info.effectiveBps)} %` : t("admin.commission.disabled")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`admin.commission.source.${info.source}` as MessageKey)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("admin.commission.bounds", { floor: bpsToPercent(info.floorBps), ceiling: bpsToPercent(info.ceilingBps) })}
      </p>
      {info.frozen ? (
        <p className="text-sm font-medium text-foreground">{t("admin.commission.frozen")}</p>
      ) : (
        <form className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
          <div className="flex-1">
            <Input
              id="event-commission"
              label={t("admin.commission.inputLabel")}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              state={fieldError ? "error" : "default"}
              errorText={fieldError}
            />
          </div>
          <Button type="submit" loading={saving} disabled={value.trim() === ""}>
            {t("admin.commission.save")}
          </Button>
        </form>
      )}
    </Card>
  );
}
