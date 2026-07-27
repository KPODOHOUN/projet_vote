import { useRef } from "react";

/**
 * Garde une ref toujours à jour avec la dernière valeur, pour lire cette valeur
 * dans un effet/closure SANS l'ajouter aux dépendances. Utile pour des valeurs
 * « fraîches mais non déclenchantes » : ici le drapeau de locale `isEn`, utilisé
 * uniquement pour des libellés de secours, qui ne doit pas re-déclencher un fetch
 * ou ré-ouvrir une connexion SSE à chaque changement de langue.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
