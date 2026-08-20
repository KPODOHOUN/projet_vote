"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../../../../../lib/i18n-provider";
import { publicEventDateLocale } from "../../../../../lib/i18n";
import { usePublicVotePayment } from "../../use-public-vote-payment";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { Label } from "../../../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../components/ui/select";
import { FormError } from "../../../../../components/ui/form-error";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Phone, CreditCard } from "lucide-react";
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
  const dateLocale = publicEventDateLocale(locale);
  const { status, submit, reset } = usePublicVotePayment({ tenantSlug: organizerSlug, eventSlug, isEn });
  const [quantity, setQuantity] = useState(1);
  const [voterPhone, setVoterPhone] = useState("");
  // Réseau mobile money. "" = détection automatique (Bénin) côté serveur.
  const [operator, setOperator] = useState("");

  const liveStatus = (status.live?.status ?? status.result?.status ?? "").toUpperCase();
  const isDone = liveStatus === "SUCCEEDED";
  const isFailed = liveStatus === "FAILED";
  const isSubmitting = status.phase === "submitting";
  const canSubmit = quantity > 0 && voterPhone.trim().length >= 8 && !isSubmitting;
  const amountCfa = voteUnitPriceCfa ? quantity * voteUnitPriceCfa : 0;

  useEffect(() => {
    if (isDone) {
      void trackEvent("vote_succeeded", { eventSlug, candidatePublicRef });
    }
  }, [isDone, eventSlug, candidatePublicRef]);

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    await submit({ candidatePublicRef, quantity, voterPhone, operator: operator || undefined });
  }

  return (
    <div className="space-y-6">
      {/* Vote Tally Header */}
      <div className="flex items-center gap-3 bg-primary/5 px-4 py-3 rounded-xl border border-primary/10 w-fit">
        <span className="text-3xl font-black text-primary tracking-tight">
          {(initialVoteCount + (isDone ? 1 : 0)).toLocaleString(dateLocale)}
        </span>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">
          {t("pub.totalVotesLabel")}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {!status.result ? (
          <motion.form
            key="vote-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
            onSubmit={onSubmit}
          >
            <div data-zone="secure-flow" className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              {voteUnitPriceCfa !== null && voteUnitPriceCfa > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-border/20">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {t("pub.pricePerVote")}
                      </span>
                    </div>
                    <span className="text-base font-black text-foreground">
                      {voteUnitPriceCfa.toLocaleString(dateLocale)} XOF
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("pub.numberOfVotes")}
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 5, 10, 20].map((preset) => {
                        const isSelected = quantity === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setQuantity(preset)}
                            className={`flex min-h-11 flex-col items-center justify-center py-2 px-1 rounded-xl border text-center transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary font-black shadow-sm"
                                : "border-border/60 bg-background/40 hover:bg-muted text-foreground font-bold"
                            }`}
                          >
                            <span className="text-xs sm:text-sm">x{preset}</span>
                            <span className="text-[9px] sm:text-[10px] opacity-80 font-mono mt-0.5">
                              {(preset * voteUnitPriceCfa).toLocaleString(dateLocale)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed border-border/30">
                      <span className="text-[11px] font-semibold text-muted-foreground">{t("pub.customQuantity")}</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                        className="h-11 text-right font-bold w-24 ml-auto bg-background/50 border-border/50 text-xs"
                      />
                      <span className="text-xs font-bold text-muted-foreground">
                        {t("pub.votesUnit")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-primary/5 border border-primary/10">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("pub.totalToPay")}
                    </span>
                    <span className="text-lg font-black text-primary">
                      {amountCfa.toLocaleString(dateLocale)} XOF
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {t("pub.noPriceConfigured")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="voterPhone" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {t("pub.momoNumber")}
                </Label>
                <Input
                  id="voterPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={voterPhone}
                  onChange={(inputEvent) => setVoterPhone(sanitizePhoneInput(inputEvent.target.value))}
                  placeholder="+225 01 02 03 04 05"
                  required
                  className="text-lg h-12 tracking-widest font-mono bg-background/50 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t("pub.momoHelp")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="operator" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  {t("pub.momoNetwork")}
                </Label>
                <Select value={operator || "auto"} onValueChange={(value) => setOperator(value === "auto" ? "" : value)}>
                  <SelectTrigger id="operator" className="w-full text-base font-semibold data-[size=default]:h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("pub.operatorAuto")}</SelectItem>
                    <SelectItem value="mtn">MTN</SelectItem>
                    <SelectItem value="moov">Moov</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              loading={isSubmitting}
              disabled={!canSubmit}
              className="h-14 w-full text-base font-bold shadow-xl"
            >
              {isSubmitting ? (
                t("pub.processingPayment")
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {t("pub.voteFor")} {candidateName} · {quantity} {t("pub.votesUnit")} · {amountCfa.toLocaleString(dateLocale)} XOF
                </span>
              )}
            </Button>
          </motion.form>
        ) : (
          <motion.section
            key="payment-status"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            data-zone="secure-flow"
            className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-lg relative overflow-hidden"
            aria-live="polite"
          >
            <h3 className="font-extrabold text-lg text-foreground border-b border-border/40 pb-3 flex items-center gap-2">
              {t("pub.voteStatusTitle")}
            </h3>

            {!isDone && !isFailed ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 bg-primary/5 rounded-xl border border-primary/10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="space-y-1">
                  <p className="font-bold text-foreground">
                    {status.label || t("pub.pendingTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {t("pub.pendingDesc")}
                  </p>
                </div>
              </div>
            ) : null}

            {isDone ? (
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 12 }}
                className="flex flex-col items-center justify-center p-6 text-center space-y-4 rounded-xl border border-[var(--color-success)]/20 bg-[var(--color-success)]/5"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.1 }}
                  className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-4"
                >
                  <CheckCircle2 className="h-12 w-12 text-[var(--color-success)]" />
                </motion.div>
                <div className="space-y-1">
                  <p className="font-bold text-foreground text-lg">
                    {t("pub.confirmedTitle")}
                  </p>
                  <p className="text-sm text-[var(--color-success-text)]">
                    {t("pub.confirmedDesc", { name: candidateName })}
                  </p>
                </div>
              </motion.div>
            ) : null}

            {isFailed ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 rounded-xl border border-destructive/20 bg-destructive/5">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.1 }}
                  className="rounded-full bg-destructive/10 p-4 border border-destructive/20"
                >
                  <AlertCircle className="h-12 w-12 text-destructive" />
                </motion.div>
                <div className="space-y-2 w-full">
                  <p className="font-bold text-foreground text-lg">
                    {t("pub.failedTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {t("pub.failedDesc")}
                  </p>
                  <Button type="button" variant="outline" className="w-full mt-2" onClick={reset}>
                    {t("pub.retry")}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="pt-4 border-t border-border/40 flex justify-between items-center text-[10px] text-muted-foreground font-mono">
              <span>{t("pub.txRef")}</span>
              <span className="font-bold text-foreground">{status.live?.providerRef ?? status.result.transactionId}</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <FormError>{status.error}</FormError>
    </div>
  );
}
