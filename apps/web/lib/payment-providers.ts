export type PaymentProviderId = "FEEXPAY" | "FEDAPAY";

export type PaymentProviderInfo = {
  id: PaymentProviderId;
  name: string;
  taglineFr: string;
  taglineEn: string;
  accent: string;
  available: boolean;
  networksFr: string;
  networksEn: string;
  logoUrl?: string;
};

export const PAYMENT_PROVIDERS: PaymentProviderInfo[] = [
  {
    id: "FEEXPAY",
    name: "FeexPay",
    taglineFr: "Mobile Money Bénin, Togo, Côte d'Ivoire",
    taglineEn: "Mobile Money Benin, Togo, Ivory Coast",
    accent: "#16a34a",
    available: true,
    networksFr: "MTN, Moov, Celtiis",
    networksEn: "MTN, Moov, Celtiis",
    logoUrl: "/payment-providers/feexpay.svg"
  },
  {
    id: "FEDAPAY",
    name: "FedaPay",
    taglineFr: "Encaissement carte et Mobile Money",
    taglineEn: "Card and Mobile Money collections",
    accent: "#2563eb",
    available: true,
    networksFr: "MTN, Moov, cartes bancaires",
    networksEn: "MTN, Moov, bank cards",
    logoUrl: "/payment-providers/fedapay.svg"
  }
];

export function getPaymentProvider(id: PaymentProviderId): PaymentProviderInfo | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
