"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api";
import { getStoredToken } from "../../../../lib/auth";
import { useI18n } from "../../../../lib/i18n-provider";
import { Button, Input, LoadingState } from "@/components/ui";
import { CreditCard, ArrowLeft, Check, Smartphone, Sparkles, Loader2 } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";
import { paymentStatusLabel } from "../../../../lib/payment-status-labels";

type PricingItem = {
  id: string;
  durationMonths: number;
  priceCfa: number;
};

type SubscribeResponse = {
  transactionId: string;
  priceCfa: number;
  durationMonths: number;
  status: string;
};

type PaymentStatusResponse = {
  status: string;
  transactionId: string;
  amountCfa: number;
  purpose: string;
};

export default function SubscribePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PricingItem | null>(null);
  const [phone, setPhone] = useState("");
  const [operator, setOperator] = useState("");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<"pricing" | "checkout" | "polling" | "success" | "failed">("pricing");
  const [error, setError] = useState("");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadPricing = async () => {
    try {
      const res = await apiFetch<PricingItem[]>("/subscriptions/pricing");
      setPricing(res);
      if (res.length > 0) {
        // select 3 months as popular by default
        const popular = res.find(p => p.durationMonths === 3) || res[0] || null;
        setSelectedPlan(popular);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPricing();
    return () => stopPolling();
  }, []);

  const startPolling = (txId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const token = getStoredToken();
        const res = await apiFetch<PaymentStatusResponse>(`/subscriptions/payment-status/${txId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setLiveStatus(res.status);
        if (res.status === "SUCCEEDED") {
          stopPolling();
          setPhase("success");
          setTimeout(() => {
            router.push("/dashboard/subscription");
          }, 3000);
        } else if (res.status === "FAILED" || res.status === "VOIDED") {
          stopPolling();
          setPhase("failed");
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    if (!phone) {
      setError(isEn ? "Payer phone number is required" : "Numéro de téléphone requis");
      return;
    }

    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }

    setIsSubmitting(true);
    setError("");

    const idempotencyKey = `sub-${selectedPlan.durationMonths}m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const res = await apiFetch<SubscribeResponse>("/subscriptions/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          durationMonths: selectedPlan.durationMonths,
          payerPhone: phone,
          operator: operator || undefined,
          idempotencyKey
        })
      });

      setTransactionId(res.transactionId);
      setLiveStatus(res.status);
      setPhase("polling");
      startPolling(res.transactionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la souscription");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label={isEn ? "Loading pricing..." : "Chargement de la grille tarifaire..."} />;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/subscription" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" />
            {isEn ? "Activate Standard Subscription" : "Activer l'abonnement Standard"}
          </h1>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {phase === "pricing" && (
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              {isEn ? "Choose your billing cycle" : "Choisissez la durée d'engagement"}
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {isEn
                ? "Select a plan duration. Longer durations offer higher discounts."
                : "Sélectionnez une formule. Plus la durée est longue, plus le tarif est avantageux."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pricing.length === 0 ? (
              <div className="col-span-full p-10 text-center text-muted-foreground border border-dashed rounded-2xl bg-card">
                {isEn
                  ? "No pricing plans are currently available. Please try again later."
                  : "Aucune formule tarifaire n'est disponible pour le moment. Veuillez réessayer plus tard."}
              </div>
            ) : (
              pricing.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const perMonthPrice = Math.round(plan.priceCfa / plan.durationMonths);
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`rounded-2xl border-2 p-6 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-48 bg-card hover:shadow-md ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-border/100"
                  }`}
                >
                  {plan.durationMonths === 3 && (
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground font-extrabold text-[10px] uppercase tracking-wider px-3 py-1 rounded-bl-xl flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Popular
                    </div>
                  )}
                  <div className="space-y-2">
                    <h3 className="text-xl font-extrabold text-foreground">
                      {plan.durationMonths} {isEn ? "Months" : "Mois"}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black tracking-tight text-foreground">
                        {plan.priceCfa.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground text-sm font-semibold">CFA</span>
                    </div>
                    <p className="text-muted-foreground text-xs font-medium">
                      {isEn ? `Equivalent to ${perMonthPrice.toLocaleString()} CFA/month` : `Soit ${perMonthPrice.toLocaleString()} CFA/mois`}
                    </p>
                  </div>
                  <div className="flex justify-end pt-4">
                    <span
                      className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          </div>

          <div className="flex justify-end pt-4">
            <Button size="lg" disabled={!selectedPlan} onClick={() => setPhase("checkout")} className="w-full sm:w-auto shadow-md">
              {isEn ? "Continue to payment" : "Passer au paiement"}
              <ArrowLeft className="w-4 h-4 ml-1.5 rotate-180" />
            </Button>
          </div>
        </div>
      )}

      {phase === "checkout" && selectedPlan && (
        <div className="max-w-md mx-auto rounded-2xl border border-border bg-card p-6 shadow-md space-y-6">
          <div className="text-center space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isEn ? "Step 2 of 2" : "Étape 2 sur 2"}
            </span>
            <h2 className="text-xl font-bold text-foreground">
              {isEn ? "Mobile Money Payment" : "Règlement Mobile Money"}
            </h2>
            <p className="text-muted-foreground text-xs">
              {isEn
                ? "Enter your mobile money number to receive the payment prompt."
                : "Saisissez votre numéro pour déclencher la demande de débit."}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border/80 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isEn ? "Formule :" : "Formule :"}</span>
              <span className="font-semibold text-foreground">
                {selectedPlan.durationMonths} {isEn ? "months" : "mois"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isEn ? "Total to pay :" : "Total à régler :"}</span>
              <span className="font-extrabold text-primary">
                {selectedPlan.priceCfa.toLocaleString()} CFA
              </span>
            </div>
          </div>

          <form onSubmit={handleSubscribe} className="space-y-4">
            <Input
              id="payerPhone"
              label={isEn ? "Mobile Money Phone Number" : "Numéro Mobile Money"}
              placeholder="ex: +22997000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              required
            />

            <div className="space-y-2">
              <label htmlFor="operator" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {isEn ? "Network (Optional)" : "Réseau (Optionnel)"}
              </label>
              <select
                id="operator"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                disabled={isSubmitting}
                className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
              >
                <option value="">{isEn ? "Auto-detect network" : "Détection automatique"}</option>
                <option value="mtn">MTN Mobile Money</option>
                <option value="moov">Moov Money</option>
                <option value="celtis">Celtis Cash</option>
              </select>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full h-11 font-bold shadow-md">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEn ? "Sending prompt..." : "Déclenchement..."}
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4 mr-2" />
                  {isEn ? "Pay via Mobile Money" : "Payer via Mobile Money"}
                </>
              )}
            </Button>
          </form>
        </div>
      )}

      {phase === "polling" && (
        <div className="max-w-md mx-auto text-center rounded-2xl border border-border bg-card p-8 shadow-md space-y-6">
          <div className="flex justify-center">
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {isEn ? "Awaiting Payment" : "Attente du paiement"}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {isEn
                ? "Please approve the USSD prompt on your phone. Do not close this page."
                : "Veuillez valider la demande de retrait USSD sur votre téléphone. Ne fermez pas cette page."}
            </p>
          </div>
          {liveStatus && (
            <div className="px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600 font-semibold text-xs inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              {paymentStatusLabel(liveStatus, isEn)}
            </div>
          )}
        </div>
      )}

      {phase === "success" && (
        <div className="max-w-md mx-auto text-center rounded-2xl border border-primary/20 bg-card p-8 shadow-lg space-y-6 animate-fade-in">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-foreground">
              {isEn ? "Abonnement Activé !" : "Abonnement Activé !"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isEn
                ? "Thank you! Your Standard subscription is now active. Redirecting..."
                : "Merci ! Votre abonnement Standard est désormais actif. Redirection..."}
            </p>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="max-w-md mx-auto text-center rounded-2xl border border-destructive/20 bg-card p-8 shadow-md space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/15 border border-destructive/30 text-destructive text-2xl font-bold">
              ✕
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {isEn ? "Payment Failed" : "Échec du paiement"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isEn
                ? "The transaction was declined or timed out. Please try again."
                : "La transaction a été refusée ou a expiré. Veuillez réessayer."}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="w-full" onClick={() => setPhase("pricing")}>
              {isEn ? "Change plan" : "Changer de formule"}
            </Button>
            <Button className="w-full shadow-sm" onClick={() => setPhase("checkout")}>
              {isEn ? "Retry payment" : "Réessayer le paiement"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
