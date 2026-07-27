/**
 * Strict types for the Feexpay provider boundary.
 *
 * Source of truth: https://docs.feexpay.me/ (api-v2.feexpay.me) — Payin endpoints.
 * Notably:
 *   - `status` is one of "PENDING" | "SUCCESSFUL" | "FAILED" (note: SUCCESSFUL,
 *     NOT "SUCCEEDED" — different from our internal PaymentStatus enum).
 *   - `amount` in the status response is returned as a STRING ("100"), not a
 *     number. We coerce to Int and compare against `tx.amountCfa`.
 *   - `currency` is "XOF" on Mobile Money payins.
 */

export type FeexpayProviderStatus = "PENDING" | "SUCCESSFUL" | "FAILED";

export interface FeexpayStatusPayload {
  status: FeexpayProviderStatus;
  amount: string | number; // Feexpay returns "100" (string) on success
  currency: string;
  externalId?: string | undefined;
  financialTransactionId?: string | undefined;
  payer?: { partyIdType?: string | undefined; partyId?: string | undefined } | undefined;
  reason?: string | undefined;
}

/**
 * Webhook payload Feexpay sends to our endpoint. We DO NOT trust any of these
 * fields for accounting decisions — only `reference` is used as the lookup key
 * for the server-to-server status pull (ADR-017). Schema kept for parsing/log
 * purposes only.
 */
export interface FeexpayWebhookPayload {
  reference?: string;
  order_id?: string;
  status?: string;
  amount?: number | string;
  callback_info?: string | Record<string, unknown> | null;
  phoneNumber?: string;
  reseau?: string;
  reason?: string;
  date?: string;
}

export type FeexpayOperator =
  | "mtn" | "moov" | "celtiis_bj" | "moov_tg" | "togocom_tg"
  | "orange_sn" | "free_sn" | "moov_ci" | "orange_ci" | "wave_ci"
  | "mtn_ci" | "mtn_cg" | "moov_bf" | "orange_bf";

export interface FeexpayInitRequest {
  amountCfa: number;
  phoneNumber: string;        // e.g. "2290166000000"
  operator: FeexpayOperator;
  shop: string;               // Feexpay shop id
  firstName?: string | undefined;
  lastName?: string | undefined;
  description?: string | undefined;
  customId?: string | undefined; // We pass our internal paymentTransaction.id here
}

export interface FeexpayInitResult {
  reference: string;          // The Feexpay reference we store as providerRef
  status: FeexpayProviderStatus;
  amount: number;
  message?: string | undefined;
}
