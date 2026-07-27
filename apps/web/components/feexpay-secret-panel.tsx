"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, CreditCard, Eye, EyeOff } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import {
  FEEXPAY_API_SECRET_KEY,
  getPaymentSetupStatus,
  saveEventSecret,
  saveOrganizerSecret,
  type PaymentSetupStatus
} from "../lib/organizer-secrets";
import { showToast } from "../lib/toast";
import type { PaymentProviderId } from "../lib/payment-providers";
import { PAYMENT_PROVIDERS } from "../lib/payment-providers";

type FeexPaySecretPanelProps = {
  token: string;
  isEn?: boolean;
  eventId?: string;
  hideWhenReady?: boolean;
  afterActivationOnly?: boolean;
  hasActivatedEvent?: boolean;
  onConfigured?: () => void;
  compact?: boolean;
  isPartnerEvent?: boolean;
};

export function FeexPaySecretPanel({
  token,
  isEn = false,
  eventId,
  hideWhenReady = false,
  afterActivationOnly = false,
  hasActivatedEvent = true,
  onConfigured,
  compact = false,
  isPartnerEvent = false
}: FeexPaySecretPanelProps) {
  const [setup, setSetup] = useState<PaymentSetupStatus | null>(null);
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<PaymentProviderId>("FEEXPAY");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await getPaymentSetupStatus(token, eventId);
      setSetup(status);
    } catch {
      setSetup(null);
    } finally {
      setIsLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = apiSecret.trim();
    if (trimmed.length < 8) {
      setError(isEn ? "Paste the code from your payment provider." : "Collez le code reçu de votre opérateur de paiement.");
      return;
    }
    if (!trimmed.startsWith("fp_") && !trimmed.startsWith("test_")) {
      setError(isEn ? "The connection code must start with 'fp_' or 'test_'." : "Le code de connexion doit commencer par 'fp_' ou 'test_'.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      if (eventId) {
        await saveEventSecret(token, eventId, FEEXPAY_API_SECRET_KEY, trimmed);
      } else {
        await saveOrganizerSecret(token, FEEXPAY_API_SECRET_KEY, trimmed);
      }
      setApiSecret("");
      showToast.success(isEn ? "Payments ready. Voters can pay you now." : "Paiements prêts. Les votants peuvent vous payer.");
      await load();
      onConfigured?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Save failed." : "Enregistrement impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isPartnerEvent) {
    return (
      <Card className="border border-primary/20 bg-primary/5 p-5">
        <p className="font-semibold text-foreground">
          {isEn ? "Payments handled for you" : "Paiements gérés pour vous"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEn
            ? "SHADOMA collects voter payments. Your share is paid out to you automatically."
            : "SHADOMA encaisse les paiements des votants. Votre part vous est reversée automatiquement."}
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border border-border p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-10 animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  if (afterActivationOnly && !hasActivatedEvent) {
    return (
      <Card className="border border-border p-5">
        <p className="font-semibold text-foreground">
          {isEn ? "Receive voter payments" : "Recevoir les paiements des votants"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEn
            ? "Put your event online first, then connect your Mobile Money account here."
            : "Mettez d'abord votre évènement en ligne, puis connectez votre compte Mobile Money ici."}
        </p>
      </Card>
    );
  }

  const isReady = setup?.readyForVotes ?? false;
  const organizerDone = setup?.organizerConfigured || setup?.eventConfigured;

  if (hideWhenReady && isReady && organizerDone) {
    return null;
  }

  if (isReady && organizerDone && compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {isEn ? "Mobile Money connected" : "Mobile Money connecté"}
      </div>
    );
  }

  if (isReady && !organizerDone && setup?.effectiveSource === "platform") {
    return (
      <Card className="space-y-4 border border-border p-5">
        <p className="text-sm text-muted-foreground">
          {isEn
            ? "Connect your Mobile Money account so voter payments go directly to you."
            : "Connectez votre compte Mobile Money pour recevoir les paiements des votants directement."}
        </p>
        <form className="space-y-3" onSubmit={onSubmit}>
          <SecretInput
            isEn={isEn}
            value={apiSecret}
            onChange={setApiSecret}
            showSecret={showSecret}
            onToggle={() => setShowSecret((v) => !v)}
          />
          <Button type="submit" loading={isSaving}>
            {isEn ? "Connect my account" : "Connecter mon compte"}
          </Button>
        </form>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      </Card>
    );
  }

  const selected = PAYMENT_PROVIDERS.find((p) => p.id === selectedProvider);
  const canConfigure = selectedProvider === "FEEXPAY";

  return (
    <Card className="space-y-5 border border-amber-500/30 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            {isEn ? "Choose your payment provider" : "Choisissez votre opérateur de paiement"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "FeexPay, KkiaPay and FedaPay are active. SebPay is coming soon."
              : "FeexPay, KkiaPay et FedaPay sont actifs. SebPay arrive bientôt."}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {PAYMENT_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={!provider.available}
            onClick={() => provider.available && setSelectedProvider(provider.id)}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              selectedProvider === provider.id
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border bg-background hover:bg-muted/50"
            } ${!provider.available ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <p className="font-bold text-foreground">{provider.name}</p>
            <p className="text-xs text-muted-foreground">{isEn ? provider.taglineEn : provider.taglineFr}</p>
          </button>
        ))}
      </div>

      {!canConfigure ? (
        <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
          {selectedProvider === "SEBPAY"
            ? isEn
              ? "SebPay integration is in progress. Use FeexPay, KkiaPay or FedaPay for now — contact support to be notified at launch."
              : "L'intégration SebPay est en cours. Utilisez FeexPay, KkiaPay ou FedaPay pour l'instant — contactez le support pour être prévenu au lancement."
            : isEn
              ? `${selected?.name ?? "This provider"} setup is managed by the SHADOMA team for now. Contact support or use FeexPay for self-service setup.`
              : `La configuration ${selected?.name ?? "de cet opérateur"} est gérée par l'équipe SHADOMA pour l'instant. Contactez le support ou utilisez FeexPay pour une configuration autonome.`}
        </div>
      ) : (
        <>
          <form className="space-y-4" onSubmit={onSubmit}>
            <SecretInput
              isEn={isEn}
              value={apiSecret}
              onChange={setApiSecret}
              showSecret={showSecret}
              onToggle={() => setShowSecret((v) => !v)}
              providerName="FeexPay"
            />
            <p className="text-xs text-muted-foreground">
              {eventId
                ? isEn
                  ? "Applies to this event only. Otherwise your default account is used."
                  : "Pour cet évènement uniquement. Sinon, votre compte par défaut est utilisé."
                : isEn
                  ? "Used for all your events unless you set one per event."
                  : "Utilisé pour tous vos évènements, sauf si vous en définissez un par évènement."}
            </p>
            <Button type="submit" size="lg" loading={isSaving} className="w-full sm:w-auto">
              {isEn ? "Save and enable FeexPay" : "Enregistrer et activer FeexPay"}
            </Button>
          </form>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </>
      )}
    </Card>
  );
}

function SecretInput({
  isEn,
  value,
  onChange,
  showSecret,
  onToggle,
  providerName = "FeexPay"
}: {
  isEn: boolean;
  value: string;
  onChange: (v: string) => void;
  showSecret: boolean;
  onToggle: () => void;
  providerName?: string;
}) {
  return (
    <div className="relative">
      <Input
        id="mobileMoneyCode"
        label={isEn ? `${providerName} connection code` : `Code de connexion ${providerName}`}
        helpText={
          isEn
            ? `Copy it from your ${providerName} merchant dashboard.`
            : `Copiez-le depuis votre espace marchand ${providerName}.`
        }
        type={showSecret ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isEn ? "Paste your code here" : "Collez votre code ici"}
        autoComplete="off"
        className="pr-12"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-[2.125rem] text-muted-foreground hover:text-foreground"
        aria-label={showSecret ? (isEn ? "Hide code" : "Masquer le code") : isEn ? "Show code" : "Afficher le code"}
      >
        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
