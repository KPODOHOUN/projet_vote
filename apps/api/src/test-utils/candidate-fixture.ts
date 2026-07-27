import { generatePublicRef } from "../common/public-ref";

/** Données candidat pour les tests (publicRef obligatoire depuis la migration). */
export function candidateTestData(
  eventId: string,
  data: { fullName: string; number?: number | null; photoUrl?: string }
) {
  return {
    eventId,
    fullName: data.fullName,
    publicRef: generatePublicRef(),
    ...(data.number !== undefined ? { number: data.number } : {}),
    ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl } : {})
  };
}
