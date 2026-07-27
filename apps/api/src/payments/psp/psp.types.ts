import type { PaymentProvider } from "@prisma/client";

/**
 * Provider-neutral payment boundary. Each adapter normalizes its own quirks
 * (FeexPay's "SUCCESSFUL" vs internal "SUCCEEDED", amount-as-string, operator
 * codes) so callers never branch on the provider. Statuses below are the
 * NORMALIZED tri-state — distinct from Prisma's PaymentStatus enum.
 */
export type PspNormalizedStatus = "PENDING" | "SUCCEEDED" | "FAILED";

/** Credentials resolved per-request from the EventSecret → TenantSecret → env chain. */
export interface PspCredentials {
  apiKey: string;
  shop: string;
  // KkiaPay uses a three-key scheme; optional so Feexpay/Fedapay ignore them.
  kkiapayPublicKey?: string | undefined;
  kkiapayPrivateKey?: string | undefined;
  kkiapaySecretKey?: string | undefined;
}

export interface PspPayinInitInput {
  amountCfa: number;
  phoneNumber: string;
  operator: string; // provider-neutral; the adapter maps to its own code
  customId?: string | undefined; // our PaymentTransaction.id
  description?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
}

export interface PspPayinInitResult {
  reference: string; // stored as PaymentTransaction.providerRef
  status: PspNormalizedStatus;
  amountCfa: number;
}

export interface PspStatusResult {
  status: PspNormalizedStatus;
  amountCfa: number;
  /** Valeur brute renvoyée par le PSP — utilisée pour la validation stricte verify-by-pull. */
  providerAmount?: string | number | undefined;
  currency: string;
  reason?: string | undefined;
}

export interface PspPayoutInput {
  idempotencyKey: string;
  amountCfa: number;
  beneficiaryAccount: string; // msisdn (organizer) or platform account ref
  network: string; // "MTN" | "MOOV" | ...
  label: string;
}

export type PspPayoutResult =
  | { status: "SUCCEEDED"; providerRef: string }
  | { status: "FAILED"; reason: string }
  | { status: "UNCERTAIN"; reason: string }; // timeout/5xx — no auto-retry, manual resolve

/**
 * Adapter port. A single stateless instance serves all tenants; credentials are
 * passed per call (resolved by the registry), so one gateway is reused across
 * tenants without holding tenant state.
 */
export interface PspGateway {
  readonly provider: PaymentProvider;
  initPayin(input: PspPayinInitInput, creds: PspCredentials): Promise<PspPayinInitResult>;
  fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult>;
  sendPayout(input: PspPayoutInput, creds: PspCredentials): Promise<PspPayoutResult>;
  fetchPayoutStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult>;
  getBalance(creds: PspCredentials): Promise<Record<string, number>>;
}

export const PSP_REGISTRY = Symbol("PSP_REGISTRY");
