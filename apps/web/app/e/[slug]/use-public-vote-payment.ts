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
  /** Libellé d'état humanisé, partagé avec les autres tunnels de paiement. Vide si pas de suivi. */
  label: string;
  error: string;
};

const FINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "VOIDED"]);
/** Erreurs réseau consécutives tolérées avant d'interrompre le suivi par relecture. */
const MAX_POLL_ERRORS = 3;

// Paiement en cours gardé pour l'onglet : un rechargement de page reprend le
// suivi au lieu de laisser le votant sans nouvelles d'un débit en cours.
function pendingPaymentKey(eventSlug: string) {
  return `vp.vote-payment.${eventSlug}`;
}

function readPendingPayment(eventSlug: string): InitPublicPaymentResponse | null {
  try {
    const raw = window.sessionStorage.getItem(pendingPaymentKey(eventSlug));
    const parsed = raw ? (JSON.parse(raw) as Partial<InitPublicPaymentResponse>) : null;
    return parsed?.transactionId && parsed.statusToken ? (parsed as InitPublicPaymentResponse) : null;
  } catch {
    return null;
  }
}

function writePendingPayment(eventSlug: string, payment: InitPublicPaymentResponse | null) {
  try {
    if (payment) window.sessionStorage.setItem(pendingPaymentKey(eventSlug), JSON.stringify(payment));
    else window.sessionStorage.removeItem(pendingPaymentKey(eventSlug));
  } catch {
    // Stockage indisponible (navigation privée) : le suivi reste en mémoire.
  }
}

export function usePublicVotePayment(opts: { tenantSlug: string; eventSlug: string; isEn: boolean }) {
  const { tenantSlug, eventSlug, isEn } = opts;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentResult, setPaymentResult] = useState<InitPublicPaymentResponse | null>(null);
  const [livePaymentStatus, setLivePaymentStatus] = useState<PublicPaymentStatusResponse | null>(null);

  useEffect(() => {
    const pending = readPendingPayment(eventSlug);
    if (pending) setPaymentResult((current) => current ?? pending);
  }, [eventSlug]);

  async function submit(args: {
    candidatePublicRef: string;
    candidateNumber?: number;
    quantity: number;
    voterPhone: string;
    /** Réseau mobile money (mtn, moov, celtiis), choisi par le votant. */
    operator?: string | undefined;
  }) {
    setError("");
    setPaymentResult(null);
    setLivePaymentStatus(null);
    writePendingPayment(eventSlug, null);
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
      if (!FINAL_STATUSES.has(payment.status)) writePendingPayment(eventSlug, payment);
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
    writePendingPayment(eventSlug, null);
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
    const interruptedMessage = isEn
      ? "Payment tracking was interrupted. Your payment is still being checked: reload the page to see its result."
      : "Le suivi du paiement a été interrompu. Votre paiement continue d'être vérifié : rechargez la page pour voir son résultat.";

    const applyStatus = (statusResponse: PublicPaymentStatusResponse) => {
      setLivePaymentStatus(statusResponse);
      if (FINAL_STATUSES.has(statusResponse.status)) {
        hasFinalStatus = true;
        writePendingPayment(eventSlug, null);
      }
    };

    const stopPolling = () => {
      if (fallbackIntervalId) {
        clearInterval(fallbackIntervalId);
        fallbackIntervalId = null;
      }
    };

    const startPollingFallback = () => {
      if (fallbackIntervalId || hasFinalStatus) return;
      let attempts = 0;
      let consecutiveErrors = 0;
      const maxAttempts = 100;
      fallbackIntervalId = setInterval(() => {
        attempts += 1;
        void apiFetch<PublicPaymentStatusResponse>("/payments/public/status", {
          method: "POST",
          body: JSON.stringify({ tenantSlug, eventSlug, transactionId: paymentResult.transactionId, statusToken })
        })
          .then((statusResponse) => {
            consecutiveErrors = 0;
            applyStatus(statusResponse);
            if (hasFinalStatus) stopPolling();
          })
          .catch((caughtError) => {
            // Une coupure réseau passagère ne doit pas arrêter le suivi d'un débit en cours.
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_POLL_ERRORS) {
              stopPolling();
              setError(caughtError instanceof Error && caughtError.message ? `${interruptedMessage} (${caughtError.message})` : interruptedMessage);
            }
          });

        if (attempts >= maxAttempts && !hasFinalStatus) {
          stopPolling();
          setError(interruptedMessage);
        }
      }, 3_000);
    };

    const streamQuery = new URLSearchParams({ tenantSlug, eventSlug, transactionId: paymentResult.transactionId, statusToken });
    const streamUrl = `${getApiBaseUrl()}/payments/public/status/stream?${streamQuery.toString()}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (messageEvent) => {
      try {
        applyStatus(JSON.parse(messageEvent.data) as PublicPaymentStatusResponse);
        if (hasFinalStatus) {
          eventSource.close();
          stopPolling();
        }
      } catch {
        eventSource.close();
        startPollingFallback();
      }
    };

    // Flux coupé (réseau, durée maximale atteinte côté serveur) : relecture régulière.
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
