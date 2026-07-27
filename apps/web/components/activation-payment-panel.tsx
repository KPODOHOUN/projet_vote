"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { Input, Button, Card } from "@/components/ui";
import { useActivationPayment } from "../lib/use-activation-payment";
import { sanitizePhoneInput } from "../lib/phone";
import { PartnerOfferPanel } from "./partner-offer-panel";

type ActivationPaymentPanelProps = {
  eventId: string;
  token: string;
  isEn?: boolean;
  /** Titre affiché au-dessus du formulaire */
  title?: string;
  /** Sous-titre explicatif */
  description?: string;
  onActivated?: () => void;
  /** Afficher le bouton « activer gratuitement » si le forfait est à 0 */
  showFreeActivate?: boolean;
};

export function ActivationPaymentPanel({
  eventId,
  token,
  isEn = false,
  title,
  description,
  onActivated,
  showFreeActivate = true
}: ActivationPaymentPanelProps) {
  const [payerPhone, setPayerPhone] = useState("");
  // Réseau mobile money. "" = détection automatique (Bénin) côté serveur.
  const [operator, setOperator] = useState("");
  const { feeInfo, phase, error, label, payAndActivate, tryActivateFree, reset } = useActivationPayment({
    eventId,
    token,
    isEn,
    ...(onActivated ? { onActivated } : {})
  });

  const feeCfa = feeInfo?.activationFeeCfa ?? 0;
  const requiresPayment = feeInfo?.requiresPayment ?? false;
  const isTracking = phase === "tracking" || phase === "submitting";
  const isDone = phase === "succeeded";
  const isFailed = phase === "failed";

  async function onPaySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (payerPhone.trim().length < 8) return;
    await payAndActivate(payerPhone, operator || undefined);
  }

  if (isDone) {
    return (
      <Card className="border border-emerald-500/20 bg-emerald-500/5 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">
              {isEn ? "Your event is live!" : "Votre évènement est en ligne !"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isEn ? "Voters can now cast paid votes." : "Les votants peuvent désormais voter."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!requiresPayment && showFreeActivate) {
    return (
      <Card className="border border-border p-6 space-y-4">
        <div>
          <p className="font-semibold text-foreground">
            {title ?? (isEn ? "Open voting" : "Ouvrir les votes")}
          </p>
          <p className="text-sm text-muted-foreground">
            {description ??
              (isEn
                ? "Activate your vote to make it visible to voters."
                : "Activez votre vote pour le rendre visible aux votants.")}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          loading={phase === "submitting"}
          onClick={() => void tryActivateFree()}
        >
          {isEn ? "Activate now" : "Activer maintenant"}
        </Button>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      </Card>
    );
  }

  if (!requiresPayment) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card className="border border-amber-500/30 bg-amber-500/5 p-6 space-y-5">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            {title ?? (isEn ? "Put your vote online" : "Mettre votre vote en ligne")}
          </p>
          <p className="text-sm text-muted-foreground">
            {description ??
              (isEn
                ? "One payment on your phone, then voters can start voting right away."
                : "Un paiement sur votre téléphone, et les votants peuvent commencer tout de suite.")}
          </p>
          <p className="text-lg font-bold text-foreground">
            {feeCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} FCFA
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onPaySubmit}>
        <Input
          id="payerPhone"
          label={isEn ? "Your Mobile Money number" : "Votre numéro Mobile Money"}
          helpText={
            isEn
              ? "You will receive a payment prompt on this phone."
              : "Vous recevrez une demande de paiement sur ce téléphone."
          }
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={payerPhone}
          onChange={(e) => setPayerPhone(sanitizePhoneInput(e.target.value))}
          placeholder="+229 01 02 03 04 05"
          required
          disabled={isTracking}
        />
        <div className="space-y-1.5">
          <label htmlFor="activation-operator" className="block text-sm font-medium text-foreground">
            {isEn ? "Mobile Money network" : "Réseau Mobile Money"}
          </label>
          <select
            id="activation-operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            disabled={isTracking}
            className="w-full h-11 rounded-md border border-border bg-background px-3 text-base font-medium text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          >
            <option value="">{isEn ? "Auto-detect" : "Détection automatique"}</option>
            <option value="mtn">MTN</option>
            <option value="moov">Moov</option>
            <option value="orange">Orange</option>
          </select>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isTracking} disabled={payerPhone.trim().length < 8}>
          {isEn ? `Pay ${feeCfa.toLocaleString("en-GB")} FCFA and go live` : `Payer ${feeCfa.toLocaleString("fr-FR")} FCFA et lancer`}
        </Button>
      </form>

      {isTracking ? (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4" role="status">
          <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <div className="space-y-1">
            {label ? <p className="text-sm font-medium text-foreground">{label}</p> : null}
            <p className="text-sm text-muted-foreground">
              {isEn
                ? "Confirm the payment on your phone. Your event will go live automatically."
                : "Confirmez le paiement sur votre téléphone. Votre évènement sera en ligne automatiquement."}
            </p>
          </div>
        </div>
      ) : null}

      {isFailed ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-destructive">
              {error || (isEn ? "Payment failed. Try again." : "Paiement échoué. Réessayez.")}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={reset}>
            {isEn ? "Try again" : "Réessayer"}
          </Button>
        </div>
      ) : null}

      {error && !isFailed ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : null}
      </Card>

      {!isTracking && !isFailed ? (
        <PartnerOfferPanel
          eventId={eventId}
          token={token}
          isEn={isEn}
          activationFeeCfa={feeCfa}
          {...(onActivated ? { onApproved: onActivated } : {})}
        />
      ) : null}
    </div>
  );
}
