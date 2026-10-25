"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { displayedVoteCount } from "@/lib/vote-count";
import { useI18n } from "../../../../../lib/i18n-provider";
import { formatCfa, formatCount } from "../../../../../lib/format";
import { MOBILE_NETWORKS } from "../../../../../lib/mobile-networks";
import { usePublicVotePayment } from "../../use-public-vote-payment";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { Label } from "../../../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../components/ui/select";
import { FormError } from "../../../../../components/ui/form-error";
import { trackEvent } from "../../../../../lib/analytics";
import { sanitizePhoneInput } from "../../../../../lib/phone";

type Props = {
  organizerSlug: string;
  eventSlug: string;
  candidatePublicRef: string;
  candidateName: string;
  voteUnitPriceCfa: number | null;
  initialVoteCount: number;
};

const PRESETS = [1, 5, 10, 20] as const;

/**
 * Formulaire de vote (zone sanctuarisée, 7.5). Le flux de paiement et ses
 * payloads vivent dans usePublicVotePayment, inchangé : ce composant ne change
 * que la présentation. Le numéro reste dans l'état local, donc un réessai ne
 * demande pas de le ressaisir.
 */
export function CandidateVoteClient({
  organizerSlug,
  eventSlug,
  candidatePublicRef,
  candidateName,
  voteUnitPriceCfa,
  initialVoteCount
}: Props) {
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const { status, submit, reset } = usePublicVotePayment({ tenantSlug: organizerSlug, eventSlug, isEn });
  const [quantity, setQuantity] = useState(1);
  // Quantité envoyée au paiement : c'est elle qui compte après SUCCEEDED,
  // même si le champ quantité est modifié ensuite.
  const [submittedQuantity, setSubmittedQuantity] = useState<number | null>(null);
  const [voterPhone, setVoterPhone] = useState("");
  // Réseau mobile money. "" = détection automatique (Bénin) côté serveur.
  const [operator, setOperator] = useState("");

  const liveStatus = (status.live?.status ?? status.result?.status ?? "").toUpperCase();
  const isDone = liveStatus === "SUCCEEDED";
  const isFailed = liveStatus === "FAILED";
  const isSubmitting = status.phase === "submitting";
  const canSubmit = quantity > 0 && voterPhone.trim().length >= 8 && !isSubmitting;
  const hasPrice = voteUnitPriceCfa !== null && voteUnitPriceCfa > 0;
  const amountCfa = hasPrice ? quantity * voteUnitPriceCfa : 0;
  const paidQuantity = submittedQuantity ?? quantity;

  useEffect(() => {
    if (isDone) {
      void trackEvent("vote_succeeded", { eventSlug, candidatePublicRef });
    }
  }, [isDone, eventSlug, candidatePublicRef]);

  async function onSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setSubmittedQuantity(quantity);
    await submit({ candidatePublicRef, quantity, voterPhone, operator: operator || undefined });
  }

  const tally = (
    <p className="text-sm text-slate-600">
      <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
        {formatCount(displayedVoteCount(initialVoteCount, isDone ? submittedQuantity : null), locale)}
      </span>{" "}
      {t("pay.votesSoFar")}
    </p>
  );

  if (!hasPrice) {
    return (
      <div className="space-y-4">
        {tally}
        <p className="rounded-md border border-border bg-background px-4 py-3 text-sm text-slate-900">{t("pay.noPrice")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tally}

      {!status.result ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div data-zone="secure-flow" className="space-y-5 rounded-md border border-border bg-background p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <span className="text-sm text-slate-600">{t("pay.price")}</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">{formatCfa(voteUnitPriceCfa, locale)}</span>
            </div>

            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-semibold text-slate-900">{t("pay.quantity")}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRESETS.map((preset) => {
                  const isSelected = quantity === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setQuantity(preset)}
                      className={`min-h-11 rounded-md border px-2 text-base font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-slate-900 hover:bg-muted"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Label htmlFor="customQuantity" className="text-sm text-slate-600">
                  {t("pay.customQuantity")}
                </Label>
                <Input
                  id="customQuantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                  className="h-11 w-24 text-right font-bold tabular-nums"
                />
              </div>
            </fieldset>

            <div className="border-t border-border pt-3">
              <p className="text-sm text-slate-600">{t("pay.total")}</p>
              <p className="text-3xl font-extrabold text-slate-900 tabular-nums" aria-live="polite">
                {formatCfa(amountCfa, locale)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voterPhone" className="text-sm font-semibold text-slate-900">
                {t("pay.phone")}
              </Label>
              <Input
                id="voterPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={voterPhone}
                onChange={(inputEvent) => setVoterPhone(sanitizePhoneInput(inputEvent.target.value))}
                placeholder="+229"
                required
                aria-describedby="voterPhone-help"
                className="h-12 text-lg tracking-wide"
              />
              <p id="voterPhone-help" className="text-xs text-slate-600">
                {t("pay.phoneHelp")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="operator" className="text-sm font-semibold text-slate-900">
                {t("pay.network")}
              </Label>
              <Select value={operator || "auto"} onValueChange={(value) => setOperator(value === "auto" ? "" : value)}>
                <SelectTrigger id="operator" className="w-full text-base data-[size=default]:h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("pub.operatorAuto")}</SelectItem>
                  {MOBILE_NETWORKS.map((network) => (
                    <SelectItem key={network.value} value={network.value}>
                      {network.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" size="lg" loading={isSubmitting} disabled={!canSubmit} className="h-12 w-full text-base font-bold">
            {isSubmitting ? t("pay.processing") : t("pay.submit", { total: formatCfa(amountCfa, locale) })}
          </Button>
          <p className="text-sm text-slate-600">{t("pay.note")}</p>
        </form>
      ) : (
        <section data-zone="secure-flow" className="space-y-4 rounded-md border border-border bg-background p-4 sm:p-5" aria-live="polite">
          {!isDone && !isFailed ? (
            <div className="space-y-1">
              <p className="font-bold text-slate-900">{t("pay.waiting")}</p>
              <p className="text-sm text-slate-600">{t("pay.waitingDesc")}</p>
              {status.label ? <p className="text-sm text-slate-600">{status.label}</p> : null}
            </div>
          ) : null}

          {isDone ? (
            <div className="space-y-2">
              <p className="text-lg font-bold text-[var(--color-success-text)]">{t("pay.confirmed", { name: candidateName })}</p>
              <p className="text-sm text-slate-900 tabular-nums">
                {t("pay.confirmedDetail", {
                  quantity: formatCount(paidQuantity, locale),
                  total: formatCfa(paidQuantity * voteUnitPriceCfa, locale)
                })}
              </p>
              <Link href={`/e/${eventSlug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">
                {t("pay.backToCandidates")}
              </Link>
            </div>
          ) : null}

          {isFailed ? (
            <div className="space-y-3">
              <FormError>{t("pay.failed")}</FormError>
              <Button type="button" variant="outline" className="h-12 w-full" onClick={reset}>
                {t("pay.retry")}
              </Button>
            </div>
          ) : null}

          <p className="flex justify-between gap-3 border-t border-border pt-3 font-mono text-xs text-slate-600">
            <span>{t("pay.ref")}</span>
            <span className="truncate text-slate-900">{status.live?.providerRef ?? status.result.transactionId}</span>
          </p>
        </section>
      )}

      <FormError>{status.error}</FormError>
    </div>
  );
}
