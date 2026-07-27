import { PaymentProvider } from "@prisma/client";

/** Clé du secret chiffré : clé API FeexPay de l'organisateur (ADR-016). */
export const FEEXPAY_API_SECRET_KEY = "feexpay_api_secret";
/** Clé API FedaPay (Bearer secret) de l'organisateur. */
export const FEDAPAY_API_SECRET_KEY = "fedapay_api_secret";
/** Trois clés KkiaPay de l'organisateur (schéma public/private/secret). */
export const KKIAPAY_PUBLIC_SECRET_KEY = "kkiapay_public_key";
export const KKIAPAY_PRIVATE_SECRET_KEY = "kkiapay_private_key";
export const KKIAPAY_SECRET_SECRET_KEY = "kkiapay_secret_key";

/**
 * Clés de secret organisateur pertinentes pour un provider donné. FeexPay et
 * FedaPay n'ont qu'une clé ; KkiaPay en a trois (toutes requises pour router
 * un payin sur le compte de l'organisateur).
 */
export function paymentSecretKeys(provider: PaymentProvider): string[] {
  switch (provider) {
    case PaymentProvider.FEEXPAY:
      return [FEEXPAY_API_SECRET_KEY];
    case PaymentProvider.FEDAPAY:
      return [FEDAPAY_API_SECRET_KEY];
    case PaymentProvider.KKIAPAY:
      return [KKIAPAY_PUBLIC_SECRET_KEY, KKIAPAY_PRIVATE_SECRET_KEY, KKIAPAY_SECRET_SECRET_KEY];
    default:
      return [];
  }
}
