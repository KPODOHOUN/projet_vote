import type { PaymentProvider } from "@prisma/client";

/**
 * Provider-neutral payment boundary. Each adapter normalizes its own quirks
 * (FeexPay's "SUCCESSFUL" vs internal "SUCCEEDED", amount-as-string, operator
 * codes) so callers never branch on the provider. Statuses below are the
 * NORMALIZED tri-state — distinct from Prisma's PaymentStatus enum.
 */
export type PspNormalizedStatus = "PENDING" | "SUCCEEDED" | "FAILED";

/** Identifiants du compte prestataire de la plateforme. */
export interface PspCredentials {
  apiKey: string;
  shop: string;
}

export interface PspPayinInitInput {
  amountCfa: number;
  phoneNumber: string;
  operator: string; // provider-neutral; the adapter maps to its own code
  customId?: string | undefined; // our PaymentTransaction.id
  description?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  /**
   * Appelé dès que le prestataire a attribué sa référence, AVANT l'envoi USSD :
   * si l'envoi échoue ou expire ensuite, la transaction reste rattachée à cette
   * référence et la réconciliation tranche (aucun paiement encaissé sans trace).
   */
  onReference?: ((reference: string) => Promise<void>) | undefined;
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

/**
 * Adapter port. A single stateless instance serves all tenants; credentials are
 * passed per call (resolved by the registry), so one gateway is reused across
 * tenants without holding tenant state.
 */
export interface PspGateway {
  readonly provider: PaymentProvider;
  initPayin(input: PspPayinInitInput, creds: PspCredentials): Promise<PspPayinInitResult>;
  fetchPayinStatus(reference: string, creds: PspCredentials): Promise<PspStatusResult>;
  getBalance(creds: PspCredentials): Promise<Record<string, number>>;
}

export const PSP_REGISTRY = Symbol("PSP_REGISTRY");
