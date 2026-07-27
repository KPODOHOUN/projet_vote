import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { paymentStatusLabel } from "@/lib/payment-status-labels";

// Flux de paiement public éprouvé (consent → cast → init → SSE + fallback
// polling), extrait d'EventVoteClient pour être partagé par les pages profil
// candidat. Logique inchangée ; le candidat ciblé est passé à `submit`.

type CastVoteResponse = { id: string; amountCfa: number };
type InitPublicPaymentResponse = {
  transactionId: string;
  provider: string;
  status: string;
  // Opaque capability token: authorizes status polling without ever putting the
  // voter's phone (PII) in a URL query string.
  statusToken: string;
};
type PublicPaymentStatusResponse = {
  transactionId: string;
  status: string;
  provider: string;
  providerRef: string | null;
  updatedAt: string;
};

export type PublicVoteStatus = {
  phase: "idle" | "submitting" | "tracking";
  result: InitPublicPaymentResponse | null;
  live: PublicPaymentStatusResponse | null;
  /** Libellé d'état humanisé, partagé avec le tunnel d'activation. Vide si pas de suivi. */
  label: string;
  error: string;
};

export function usePublicVotePayment(opts: { tenantSlug: string; eventSlug: string; isEn: boolean }) {
  const { tenantSlug, eventSlug, isEn } = opts;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentResult, setPaymentResult] = useState<InitPublicPaymentResponse | null>(null);
  const [livePaymentStatus, setLivePaymentStatus] = useState<PublicPaymentStatusResponse | null>(null);

  async function submit(args: {
    candidatePublicRef: string;
    candidateNumber?: number;
    quantity: number;
    voterPhone: string;
    /** Réseau mobile money (mtn/moov/orange…) — optionnel, détection Bénin par défaut. */
    operator?: string | undefined;
  }) {
    setError("");
    setPaymentResult(null);
    setLivePaymentStatus(null);
    setIsSubmitting(true);

    try {
      // Le consentement RGPD est collecté via la politique affichée sur la page
      // publique ; l'endpoint /privacy/consent a été retiré de l'API.
      const vote = await apiFetch<CastVoteResponse>("/votes/cast", {
        method: "POST",
        body: JSON.stringify({
          tenantSlug,
          eventSlug,
          candidatePublicRef: args.candidatePublicRef,
          ...(args.candidateNumber != null ? { candidateNumber: args.candidateNumber } : {}),
          quantity: args.quantity,
          voterPhone: args.voterPhone
        })
      });

      const idempotencyKey = `public-${vote.id}-${Date.now()}`;
      const payment = await apiFetch<InitPublicPaymentResponse>("/payments/public/init", {
        method: "POST",
        body: JSON.stringify({
          tenantSlug,
          eventSlug,
          voteId: vote.id,
          amountCfa: vote.amountCfa,
          idempotencyKey,
          requestFingerprint: args.voterPhone,
          // Payer MSISDN: the API pushes the mobile-money USSD prompt to this phone.
          payerPhone: args.voterPhone,
          ...(args.operator ? { operator: args.operator } : {})
        })
      });
      setPaymentResult(payment);
      setLivePaymentStatus({
        transactionId: payment.transactionId,
        status: payment.status,
        provider: payment.provider,
        providerRef: null,
        updatedAt: new Date().toISOString()
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Vote failed." : "Le vote a échoué.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset() {
    setPaymentResult(null);
    setLivePaymentStatus(null);
    setError("");
  }

  useEffect(() => {
    if (!paymentResult || !paymentResult.statusToken) {
      return;
    }
    const statusToken = paymentResult.statusToken;

    let hasFinalStatus = false;
    let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;

    const startPollingFallback = () => {
      if (fallbackIntervalId || hasFinalStatus) return;
      let attempts = 0;
      const maxAttempts = 40;
      fallbackIntervalId = setInterval(() => {
        attempts += 1;
        void apiFetch<PublicPaymentStatusResponse>("/payments/public/status", {
          method: "POST",
          body: JSON.stringify({ tenantSlug, eventSlug, transactionId: paymentResult.transactionId, statusToken })
        })
          .then((statusResponse) => {
            setLivePaymentStatus(statusResponse);
            if (statusResponse.status === "SUCCEEDED" || statusResponse.status === "FAILED") {
              hasFinalStatus = true;
              if (fallbackIntervalId) {
                clearInterval(fallbackIntervalId);
                fallbackIntervalId = null;
              }
            }
          })
          .catch((caughtError) => {
            setError(caughtError instanceof Error ? caughtError.message : isEn ? "Payment tracking error." : "Erreur de suivi du paiement.");
            if (fallbackIntervalId) {
              clearInterval(fallbackIntervalId);
              fallbackIntervalId = null;
            }
          });

        if (attempts >= maxAttempts && fallbackIntervalId) {
          clearInterval(fallbackIntervalId);
          fallbackIntervalId = null;
        }
      }, 3_000);
    };

    const streamQuery = new URLSearchParams({ tenantSlug, eventSlug, transactionId: paymentResult.transactionId, statusToken });
    const streamUrl = `${getApiBaseUrl()}/payments/public/status/stream?${streamQuery.toString()}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (messageEvent) => {
      try {
        const parsed = JSON.parse(messageEvent.data) as PublicPaymentStatusResponse;
        setLivePaymentStatus(parsed);
        if (parsed.status === "SUCCEEDED" || parsed.status === "FAILED") {
          hasFinalStatus = true;
          eventSource.close();
          if (fallbackIntervalId) {
            clearInterval(fallbackIntervalId);
            fallbackIntervalId = null;
          }
        }
      } catch {
        setError(isEn ? "Invalid real-time stream." : "Flux en temps réel invalide.");
        eventSource.close();
        startPollingFallback();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (!hasFinalStatus) {
        startPollingFallback();
      }
    };

    return () => {
      eventSource.close();
      if (fallbackIntervalId) {
        clearInterval(fallbackIntervalId);
      }
    };
  }, [paymentResult, tenantSlug, eventSlug, isEn]);

  const status: PublicVoteStatus = {
    phase: isSubmitting ? "submitting" : paymentResult ? "tracking" : "idle",
    result: paymentResult,
    live: livePaymentStatus,
    label: livePaymentStatus ? paymentStatusLabel(livePaymentStatus.status, isEn) : "",
    error
  };

  return { status, submit, reset };
}
