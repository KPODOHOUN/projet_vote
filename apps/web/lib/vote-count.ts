/**
 * Voix affichées sur le profil candidat. Le total serveur ne bouge qu'au
 * rechargement : après un paiement confirmé (SUCCEEDED), on ajoute la quantité
 * réellement payée, jamais un « +1 » forfaitaire, et rien avant confirmation.
 */
export function displayedVoteCount(serverCount: number, confirmedQuantity: number | null): number {
  if (confirmedQuantity === null || !Number.isInteger(confirmedQuantity) || confirmedQuantity <= 0) {
    return serverCount;
  }
  return serverCount + confirmedQuantity;
}
