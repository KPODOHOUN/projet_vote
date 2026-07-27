"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { Handshake, Info } from "lucide-react";
import { Button, Card, Checkbox, Input, Label } from "@/components/ui";
import {
  formatRevenueRange,
  getEventPartnerStatus,
  listOfferTiers,
  requestPartnerOffer,
  type PartnerOfferTier
} from "../lib/partners";
import { showToast } from "../lib/toast";

type PartnerOfferPanelProps = {
  eventId: string;
  token: string;
  isEn?: boolean;
  activationFeeCfa: number;
  onApproved?: () => void;
};

const MIN_REASON_LENGTH = 20;

export function PartnerOfferPanel({
  eventId,
  token,
  isEn = false,
  activationFeeCfa,
  onApproved
}: PartnerOfferPanelProps) {
  const [reason, setReason] = useState("");
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [tiers, setTiers] = useState<PartnerOfferTier[]>([]);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getEventPartnerStatus>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [next, offerTiers] = await Promise.all([
        getEventPartnerStatus(token, eventId),
        listOfferTiers(token).catch(() => [] as PartnerOfferTier[])
      ]);
      setStatus(next);
      setTiers(offerTiers);
      if (next.isPartnerEvent || next.request?.status === "APPROVED") {
        onApproved?.();
      }
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [token, eventId, onApproved]);

  useEffect(() => {
    void load();
  }, [load]);

  const estimatedNum = Number.parseInt(estimatedRevenue.replace(/\s/g, ""), 10);
  const hasValidEstimate = Number.isFinite(estimatedNum) && estimatedNum > 0;
  const matchedTier =
    hasValidEstimate
      ? tiers.find(
          (tier) =>
            estimatedNum >= tier.minRevenueCfa &&
            (tier.maxRevenueCfa == null || estimatedNum <= tier.maxRevenueCfa)
        )
      : undefined;
  const reasonTrimmed = reason.trim();
  const canSubmit =
    reasonTrimmed.length >= MIN_REASON_LENGTH && hasValidEstimate && acceptedTerms && !isSubmitting;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setIsSubmitting(true);
    try {
      await requestPartnerOffer(token, eventId, reasonTrimmed, estimatedNum, true);
      showToast.success(
        isEn
          ? "Request sent. We will reply within 24 to 72 hours."
          : "Demande envoyée. Réponse sous 24 à 72 h."
      );
      setReason("");
      setEstimatedRevenue("");
      setAcceptedTerms(false);
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : isEn
            ? "Request failed."
            : "Envoi impossible."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return null;

  if (status?.isPartnerEvent) {
    return (
      <Card className="border border-emerald-500/20 bg-emerald-500/5 p-5">
        <p className="font-semibold text-foreground">
          {isEn ? "You're on the partner plan" : "Vous êtes sur la formule partenaire"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEn
            ? "SHADOMA handles voter payments for you. Your share is sent to you after each vote period."
            : "SHADOMA gère les paiements des votants pour vous. Votre part vous est reversée après les votes."}
        </p>
        {status.partnerPlatformSharePercent != null ? (
          <p className="mt-2 text-sm font-medium text-foreground">
            {isEn ? "Our fee:" : "Notre commission :"}{" "}
            {status.partnerPlatformSharePercent.toFixed(1)} %
          </p>
        ) : null}
      </Card>
    );
  }

  if (status?.request?.status === "PENDING") {
    return (
      <Card className="border border-amber-500/30 bg-amber-500/5 p-5">
        <p className="font-semibold text-foreground">
          {isEn ? "We're reviewing your request" : "Nous examinons votre demande"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEn
            ? "Launch now, pay later. We process partner requests within 24 to 72 hours."
            : "Lancez maintenant, payez plus tard. Les demandes partenaires sont traitées sous 24 à 72 h."}
        </p>
      </Card>
    );
  }

  if (status?.request?.status === "REJECTED") {
    return (
      <Card className="border border-destructive/20 bg-destructive/5 p-5">
        <p className="font-semibold text-foreground">
          {isEn ? "Partner plan not available" : "Formule partenaire non disponible"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEn
            ? "Pay the launch fee via Mobile Money to open voting."
            : "Réglez le forfait de lancement via Mobile Money pour ouvrir les votes."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="border border-primary/20 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            {isEn ? "No budget right now?" : "Pas de budget pour l'instant ?"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? `Launch without paying ${activationFeeCfa.toLocaleString("en-GB")} FCFA today. SHADOMA collects voter payments. Nothing to set up on your side.`
              : `Lancez sans payer ${activationFeeCfa.toLocaleString("fr-FR")} FCFA aujourd'hui. SHADOMA encaisse les votes. Rien à configurer de votre côté.`}
          </p>
        </div>
      </div>

      <section className="space-y-2" aria-labelledby="partner-grid-heading">
        <h4 id="partner-grid-heading" className="text-sm font-semibold text-foreground">
          {isEn ? "Commission grid" : "Grille de commissions"}
        </h4>
        {tiers.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-background/80">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">
                    {isEn ? "Expected revenue (FCFA)" : "Recettes prévues (FCFA)"}
                  </th>
                  <th className="px-3 py-2 font-semibold">
                    {isEn ? "SHADOMA commission" : "Commission SHADOMA"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr
                    key={tier.id}
                    className={`border-t border-border ${matchedTier?.id === tier.id ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2">{formatRevenueRange(tier, isEn)}</td>
                    <td className="px-3 py-2 font-medium">{(tier.platformShareBps / 100).toFixed(1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "The commission grid will be shown here once configured by the platform."
              : "La grille de commissions s'affichera ici dès qu'elle sera configurée par la plateforme."}
          </p>
        )}
        <div className="flex items-start gap-2 rounded-lg border border-border/80 bg-background/60 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isEn
              ? "If your actual revenue exceeds your estimate, we automatically apply the percentage that matches your real total, according to this grid. This prevents under-declaring expected revenue."
              : "Si vos recettes réelles dépassent votre estimation, nous appliquons automatiquement le pourcentage correspondant à votre total réel, selon cette grille. Cela évite toute sous-estimation volontaire."}
          </p>
        </div>
      </section>

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          id="estimatedRevenue"
          label={isEn ? "How much do you expect to collect? (FCFA)" : "Combien pensez-vous collecter ? (FCFA)"}
          helpText={
            isEn
              ? "Required. We use this to suggest the right commission band."
              : "Obligatoire. Sert à proposer la bonne tranche de commission."
          }
          value={estimatedRevenue}
          onChange={(e) => setEstimatedRevenue(e.target.value.replace(/[^\d\s]/g, ""))}
          placeholder={isEn ? "e.g. 1500000" : "ex. 1500000"}
          required
          disabled={isSubmitting}
        />
        {matchedTier ? (
          <p className="text-sm text-muted-foreground">
            {isEn ? "Suggested band for your estimate:" : "Tranche suggérée pour votre estimation :"}{" "}
            <span className="font-medium text-foreground">
              {matchedTier.label} · {(matchedTier.platformShareBps / 100).toFixed(1)} %
            </span>
          </p>
        ) : hasValidEstimate && tiers.length > 0 ? (
          <p className="text-sm text-amber-700">
            {isEn
              ? "Your estimate does not match a band. We will assign the correct rate on approval."
              : "Votre estimation ne correspond à aucune tranche. Nous fixerons le bon taux à l'approbation."}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="partnerReason" className="text-sm font-medium">
            {isEn
              ? "Why do you choose the partner plan?"
              : "Pourquoi choisissez-vous la formule partenaire ?"}{" "}
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          </Label>
          <textarea
            id="partnerReason"
            className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isEn
                ? "e.g. We cannot pay the launch fee upfront but expect strong voter turnout."
                : "ex. Nous ne pouvons pas payer le forfait maintenant mais prévoyons un fort volume de votes."
            }
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={500}
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            {isEn
              ? `At least ${MIN_REASON_LENGTH} characters. Be specific about your situation.`
              : `Minimum ${MIN_REASON_LENGTH} caractères. Soyez précis sur votre situation.`}
            {reasonTrimmed.length > 0 ? (
              <span className="ml-1">
                ({reasonTrimmed.length}/{MIN_REASON_LENGTH})
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-background/80 p-3">
          <Checkbox
            id="partnerTerms"
            checked={acceptedTerms}
            onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
            disabled={isSubmitting}
            aria-required="true"
          />
          <Label htmlFor="partnerTerms" className="cursor-pointer text-sm leading-relaxed font-normal">
            {isEn ? (
              <>
                I accept the partner plan terms: deferred launch fee recovered from commissions, commission per the
                grid above, automatic rate adjustment if actual revenue exceeds my estimate, SHADOMA collects voter
                payments, and processing within 24 to 72 hours. See also our{" "}
                <Link href="/terms" className="text-primary underline underline-offset-2">
                  terms of use
                </Link>
                .
              </>
            ) : (
              <>
                J&apos;accepte les conditions de la formule partenaire : forfait de lancement différé prélevé sur les
                commissions, commission selon la grille ci-dessus, ajustement automatique du taux si les recettes
                réelles dépassent mon estimation, encaissement des votes par SHADOMA, et traitement de la demande sous
                24 à 72 h. Voir aussi nos{" "}
                <Link href="/terms" className="text-primary underline underline-offset-2">
                  conditions d&apos;utilisation
                </Link>
                .
              </>
            )}
          </Label>
        </div>

        <Button type="submit" variant="secondary" loading={isSubmitting} disabled={!canSubmit}>
          {isEn ? "Submit partner request" : "Envoyer la demande partenaire"}
        </Button>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
