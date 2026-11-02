"use client";

import { useQuery } from "@tanstack/react-query";
import { authedFetch } from "../api";
import { MOBILE_NETWORKS } from "../mobile-networks";

/**
 * Réseaux que le prestataire de l'organisateur sait débiter (ajout de votes
 * par l'organisateur). Tant que la liste n'est pas chargée, tous les
 * réseaux restent proposés : l'API refuse de toute façon un réseau non
 * accepté, avant tout paiement.
 */
export function usePayinNetworks(eventId?: string) {
  const query = useQuery({
    queryKey: ["payin-networks", eventId ?? null],
    queryFn: () =>
      authedFetch<{ paymentNetworks: string[] }>(
        `/payments/networks${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`
      ),
    staleTime: 5 * 60_000
  });
  const accepted = query.data?.paymentNetworks;
  return accepted ? MOBILE_NETWORKS.filter((network) => accepted.includes(network.value)) : MOBILE_NETWORKS;
}
