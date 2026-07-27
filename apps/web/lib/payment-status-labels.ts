/**
 * Libellé humanisé unique pour un statut de paiement, partagé par tous les
 * tunnels (vote public, activation organisateur). Le PSP n'est jamais exposé.
 */
export function paymentStatusLabel(status: string, isEn: boolean): string {
  switch (status.toUpperCase()) {
    case "PENDING":
      return isEn ? "Awaiting mobile-money confirmation…" : "En attente de confirmation mobile money…";
    case "SUCCEEDED":
      return isEn ? "Payment confirmed" : "Paiement confirmé";
    case "FAILED":
      return isEn ? "Payment failed" : "Le paiement a échoué";
    default:
      return isEn ? "Processing…" : "Traitement en cours…";
  }
}
