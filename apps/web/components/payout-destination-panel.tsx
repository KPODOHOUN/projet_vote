"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  Button,
  FormError,
  Input,
  Label,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { usePayoutDestinationMutation, usePayoutDestinationQuery } from "../lib/hooks/use-wallet";
import { useI18n } from "../lib/i18n-provider";
import { MOBILE_NETWORKS, isValidMobileMoneyNumber, mobileNetworkLabel } from "../lib/mobile-networks";
import { showToast } from "../lib/toast";

/**
 * Numéro Mobile Money sur lequel SHADOMA envoie les retraits validés.
 * L'API exige ce numéro avant toute demande de retrait ; elle ne renvoie
 * jamais le numéro complet, seulement le réseau et les 4 derniers chiffres.
 */
export function PayoutDestinationPanel() {
  const { t } = useI18n();
  const destinationQuery = usePayoutDestinationQuery();
  const mutation = usePayoutDestinationMutation();
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<string>(MOBILE_NETWORKS[0].value);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const cleaned = phone.replace(/[\s.-]/g, "");
    if (!isValidMobileMoneyNumber(cleaned)) {
      setFieldError(t("payoutDest.invalidPhone"));
      return;
    }
    setFieldError(undefined);
    try {
      await mutation.mutateAsync({ phone: cleaned, network: network.toUpperCase() });
      setPhone("");
      showToast.success(t("payoutDest.saved"));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("account.genericError"));
    }
  };

  const current = destinationQuery.data ?? null;

  return (
    <section id="payout-destination" className="bg-card p-6 rounded-xl border border-border shadow-sm">
      <h3 className="text-xl font-bold tracking-tight text-foreground">{t("payoutDest.title")}</h3>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("payoutDest.help")}</p>

      <div className="mt-4">
        {destinationQuery.isPending ? (
          <LoadingState variant="rows" count={1} label={t("payoutDest.title")} />
        ) : destinationQuery.isError ? (
          <FormError>{t("payoutDest.loadFailed")}</FormError>
        ) : current ? (
          <p className="font-medium text-foreground tabular-nums">
            {t("payoutDest.current", { network: mobileNetworkLabel(current.network), last4: current.last4 })}
          </p>
        ) : (
          <p className="font-medium text-foreground">{t("payoutDest.none")}</p>
        )}
      </div>

      <form className="mt-4 max-w-md space-y-4" onSubmit={onSubmit} noValidate>
        <Input
          id="payout-phone"
          label={t("payoutDest.phoneLabel")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+229…"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          state={fieldError ? "error" : "default"}
          errorText={fieldError}
          required
        />
        <div className="space-y-2">
          <Label htmlFor="payout-network">{t("payoutDest.networkLabel")}</Label>
          <Select value={network} onValueChange={setNetwork}>
            <SelectTrigger id="payout-network" className="w-full data-[size=default]:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOBILE_NETWORKS.map((n) => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {submitError ? <FormError>{submitError}</FormError> : null}
        <Button type="submit" loading={mutation.isPending}>
          {current ? t("payoutDest.replace") : t("payoutDest.save")}
        </Button>
      </form>
    </section>
  );
}
