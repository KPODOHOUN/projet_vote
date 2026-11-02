// Nom et initiales affichés dans le menu profil : jamais l'e-mail brut en titre.

type NamedUser = { firstName?: string | null; lastName?: string | null; email: string };

/** Prénom + nom ; à défaut la partie avant « @ » de l'e-mail, avec une majuscule. */
export function displayName(user: NamedUser): string {
  const full = [user.firstName, user.lastName].map((p) => p?.trim()).filter(Boolean).join(" ");
  if (full) return full;
  const local = user.email.split("@")[0] || user.email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Deux lettres au plus : première et dernière partie du nom (« Awa Kouassi » → « AK »). */
export function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : [parts[0]!];
  return letters.map((p) => p.charAt(0)).join("").toUpperCase().slice(0, 2);
}
