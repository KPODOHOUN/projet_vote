export type PaymentProviderId = "FEEXPAY" | "KKIAPAY" | "FEDAPAY" | "SEBPAY";

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
    id: "KKIAPAY",
    name: "KkiaPay",
    taglineFr: "Paiement mobile Afrique de l'Ouest",
    taglineEn: "West Africa mobile payments",
    accent: "#ea580c",
    available: true,
    networksFr: "MTN, Moov, Orange, Wave",
    networksEn: "MTN, Moov, Orange, Wave",
    logoUrl: "/payment-providers/kkiapay.svg"
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
  },
  {
    id: "SEBPAY",
    name: "SebPay",
    taglineFr: "Mobile Money Bénin — bientôt disponible",
    taglineEn: "Benin Mobile Money — coming soon",
    accent: "#7c3aed",
    available: false,
    networksFr: "MTN, Moov (à venir)",
    networksEn: "MTN, Moov (coming)",
    logoUrl: "/payment-providers/sebpay.webp"
  }
];

export function getPaymentProvider(id: PaymentProviderId): PaymentProviderInfo | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
