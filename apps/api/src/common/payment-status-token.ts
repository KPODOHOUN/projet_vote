import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";

/**
 * Capability token bound to a PaymentTransaction id, used to authorize public
 * status polling / SSE WITHOUT putting the voter's phone number (PII) in a URL
 * query string — which would otherwise be written to access logs and any proxy
 * in front of the API.
 *
 * It is a deterministic HMAC over the transaction id (domain-separated), so no
 * storage / migration is needed: the server recomputes and compares in constant
 * time. It reveals nothing about the voter and only grants read access to a
 * transaction's payment status (no PII in the response).
 */
export function paymentStatusToken(transactionId: string): string {
  return createHmac("sha256", env.API_JWT_SECRET)
    .update(`payment-status:${transactionId}`)
    .digest("hex");
}

export function verifyPaymentStatusToken(transactionId: string, token: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(paymentStatusToken(transactionId), "utf8");
  const provided = Buffer.from(token, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
