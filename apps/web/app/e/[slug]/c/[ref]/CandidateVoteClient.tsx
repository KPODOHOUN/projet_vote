"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../../../../../lib/i18n-provider";
import { usePublicVotePayment } from "../../use-public-vote-payment";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { Label } from "../../../../../components/ui/label";
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
  const { locale } = useI18n();
  const isEn = locale === "en";
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
          {(initialVoteCount + (isDone ? 1 : 0)).toLocaleString(isEn ? "en-GB" : "fr-FR")}
        </span>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">
          {isEn ? "total votes" : "votes au total"}
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
            <div className="space-y-4 bg-muted/40 p-5 sm:p-6 rounded-2xl border border-border/50 backdrop-blur-sm">
              {voteUnitPriceCfa !== null && voteUnitPriceCfa > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-border/20">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {isEn ? "Price per vote" : "Prix du vote"}
                      </span>
                    </div>
                    <span className="text-base font-black text-foreground">
                      {voteUnitPriceCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {isEn ? "Number of votes" : "Nombre de votes"}
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 5, 10, 20].map((preset) => {
                        const isSelected = quantity === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setQuantity(preset)}
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-center transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary font-black shadow-sm"
                                : "border-border/60 bg-background/40 hover:bg-muted text-foreground font-bold"
                            }`}
                          >
                            <span className="text-xs sm:text-sm">x{preset}</span>
                            <span className="text-[9px] sm:text-[10px] opacity-80 font-mono mt-0.5">
                              {(preset * voteUnitPriceCfa).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed border-border/30">
                      <span className="text-[11px] font-semibold text-muted-foreground">{isEn ? "Custom quantity:" : "Quantité libre :"}</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                        className="h-8 text-right font-bold w-20 ml-auto bg-background/50 border-border/50 text-xs"
                      />
                      <span className="text-xs font-bold text-muted-foreground">
                        {isEn ? "votes" : "voix"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-primary/5 border border-primary/10">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {isEn ? "Total to pay" : "Total à payer"}
                    </span>
                    <span className="text-lg font-black text-primary">
                      {amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {isEn
                      ? "This event has no voting price configured yet."
                      : "Cet évènement n'a pas encore de prix de vote défini."}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="voterPhone" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {isEn ? "Mobile Money number" : "Numéro Mobile Money"}
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
                  {isEn
                    ? "Enter your full international number (e.g. +229 Benin, +225 Ivory Coast, +221 Senegal)."
                    : "Saisissez votre numéro au format international (ex: +229 Bénin, +225 Côte d'Ivoire, +221 Sénégal)."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="operator" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  {isEn ? "Mobile Money network" : "Réseau Mobile Money"}
                </Label>
                <select
                  id="operator"
                  value={operator}
                  onChange={(inputEvent) => setOperator(inputEvent.target.value)}
                  className="w-full h-12 rounded-md border border-border/50 bg-background/50 px-3 text-base font-semibold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">{isEn ? "Auto-detect" : "Détection automatique"}</option>
                  <option value="mtn">MTN</option>
                  <option value="moov">Moov</option>
                  <option value="orange">Orange</option>
                </select>
              </div>
            </div>

            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <Button 
                type="submit" 
                size="lg" 
                className="w-full h-14 text-base font-bold shadow-xl transition-all bg-primary hover:bg-primary/90 text-primary-foreground relative overflow-hidden group" 
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {isEn ? "Processing Secure Payment…" : "Paiement Sécurisé…"}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 justify-center">
                    <Sparkles className="w-4 h-4 transition-transform group-hover:scale-110" />
                    {isEn ? "Vote for" : "Voter pour"} {candidateName} · {quantity} {isEn ? "vote" : "voix"} · {amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF
                  </span>
                )}
              </Button>
            </motion.div>
          </motion.form>
        ) : (
          <motion.section 
            key="payment-status"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card border border-border/60 rounded-2xl p-6 space-y-6 shadow-2xl relative overflow-hidden" 
            aria-live="polite"
          >
            <h3 className="font-extrabold text-lg text-foreground border-b border-border/40 pb-3 flex items-center gap-2">
              {isEn ? "Vote status" : "Statut du vote"}
            </h3>

            {!isDone && !isFailed ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 bg-primary/5 rounded-xl border border-primary/10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="space-y-1">
                  <p className="font-bold text-foreground">
                    {status.label || (isEn ? "Pending payment confirmation" : "Confirmation de paiement en attente")}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {isEn
                      ? "Please approve the prompt sent to your phone. This screen will update automatically."
                      : "Validez la demande de paiement reçue sur votre téléphone. Cette page se mettra à jour toute seule."}
                  </p>
                </div>
              </div>
            ) : null}

            {isDone ? (
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 12 }}
                className="flex flex-col items-center justify-center p-6 text-center space-y-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10"
              >
                <motion.div 
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.1 }}
                  className="rounded-full bg-emerald-500/10 p-4 border border-emerald-500/20"
                >
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                </motion.div>
                <div className="space-y-1">
                  <p className="font-bold text-foreground text-lg">
                    {isEn ? "Vote Confirmed!" : "Vote Validé !"}
                  </p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    {isEn ? `Thank you! Your vote for ${candidateName} has been recorded.` : `Merci ! Votre vote pour ${candidateName} a bien été enregistré.`}
                  </p>
                </div>
              </motion.div>
            ) : null}

            {isFailed ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-4 bg-destructive/5 rounded-xl border border-destructive/10">
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
                    {isEn ? "Payment Failed" : "Échec du paiement"}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {isEn ? "The transaction was canceled or did not complete. Try again." : "Le paiement a été rejeté ou a échoué. Veuillez réessayer."}
                  </p>
                  <Button type="button" variant="outline" className="w-full mt-2" onClick={reset}>
                    {isEn ? "Try again" : "Réessayer"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="pt-4 border-t border-border/40 flex justify-between items-center text-[10px] text-muted-foreground font-mono">
              <span>{isEn ? "Transaction Reference" : "Référence de transaction"}</span>
              <span className="font-bold text-foreground">{status.live?.providerRef ?? status.result.transactionId}</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {status.error ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 text-destructive border border-destructive/10" role="alert">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-xs font-semibold">{status.error}</p>
        </div>
      ) : null}
    </div>
  );
}
