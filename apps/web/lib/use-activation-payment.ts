"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "./api";
import { paymentStatusLabel } from "./payment-status-labels";

type ActivationFeeInfo = {
  activationFeeCfa: number;
  currency: "XOF";
  requiresPayment: boolean;
};

type InitActivationResponse = {
  transactionId: string;
  provider: string;
  status: string;
  amountCfa: number;
  providerRef?: string | null;
};

type PaymentStatusResponse = {
  transactionId: string;
  status: string;
  activationPaidAt: string | null;
};

export type ActivationPaymentPhase = "idle" | "submitting" | "tracking" | "succeeded" | "failed";

export function useActivationPayment(opts: {
  eventId: string;
  token: string;
  isEn: boolean;
  onActivated?: () => void;
}) {
  const { eventId, token, isEn, onActivated } = opts;
  const [feeInfo, setFeeInfo] = useState<ActivationFeeInfo | null>(null);
  const [phase, setPhase] = useState<ActivationPaymentPhase>("idle");
  const [error, setError] = useState("");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFee = useCallback(async () => {
    try {
      const info = await apiFetch<ActivationFeeInfo>("/payments/activation/fee");
      setFeeInfo(info);
    } catch {
      setFeeInfo({ activationFeeCfa: 0, currency: "XOF", requiresPayment: false });
    }
  }, []);

  useEffect(() => {
    void loadFee();
  }, [loadFee]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const activateEvent = useCallback(async () => {
    await apiFetch(`/events/${eventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "ACTIVE" })
    });
    setPhase("succeeded");
    onActivated?.();
  }, [eventId, token, onActivated]);

  const pollStatus = useCallback(
    async (txId: string) => {
      try {
        const status = await apiFetch<PaymentStatusResponse>(`/payments/${txId}/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setLiveStatus(status.status);
        if (status.status === "SUCCEEDED" || status.activationPaidAt) {
          stopPolling();
          await activateEvent();
        } else if (status.status === "FAILED") {
          stopPolling();
          setPhase("failed");
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : isEn ? "Tracking error." : "Erreur de suivi.");
        stopPolling();
      }
    },
    [token, isEn, stopPolling, activateEvent]
  );

  const payAndActivate = useCallback(
    async (payerPhone: string, operator?: string) => {
      setError("");
      setPhase("submitting");
      const idempotencyKey = `activation-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        const init = await apiFetch<InitActivationResponse>("/payments/activation/init", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            eventId,
            idempotencyKey,
            payerPhone: payerPhone.trim(),
            requestFingerprint: payerPhone.trim(),
            ...(operator ? { operator } : {})
          })
        });
        setTransactionId(init.transactionId);
        setLiveStatus(init.status);
        setPhase("tracking");
        stopPolling();
        pollRef.current = setInterval(() => {
          void pollStatus(init.transactionId);
        }, 3000);
        void pollStatus(init.transactionId);
      } catch (caughtError) {
        if (caughtError instanceof ApiError && caughtError.status === 409) {
          try {
            await activateEvent();
            return;
          } catch {
            // fall through
          }
        }
        setError(caughtError instanceof Error ? caughtError.message : isEn ? "Payment failed." : "Paiement impossible.");
        setPhase("failed");
      }
    },
    [eventId, token, isEn, stopPolling, pollStatus, activateEvent]
  );

  const tryActivateFree = useCallback(async () => {
    setError("");
    setPhase("submitting");
    try {
      await activateEvent();
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 402) {
        setPhase("idle");
        setError("");
        return false;
      }
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Activation failed." : "Activation impossible.");
      setPhase("failed");
      return false;
    }
    return true;
  }, [activateEvent, isEn]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setPhase("idle");
    setError("");
    setTransactionId(null);
    setLiveStatus("");
  }, [stopPolling]);

  return {
    feeInfo,
    phase,
    error,
    transactionId,
    liveStatus,
    /** Libellé d'état humanisé partagé avec le tunnel de vote public. Vide hors suivi. */
    label: liveStatus ? paymentStatusLabel(liveStatus, isEn) : "",
    payAndActivate,
    tryActivateFree,
    reset
  };
}
