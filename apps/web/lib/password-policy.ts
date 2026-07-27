/** Aligné sur strongPassword côté API (auth.service.ts). */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordClassCount(value: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
}

export function validateStrongPassword(value: string, isEn: boolean): string | undefined {
  if (!value) return isEn ? "Required field." : "Champ requis.";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return isEn ? `At least ${MIN_PASSWORD_LENGTH} characters.` : `${MIN_PASSWORD_LENGTH} caractères minimum.`;
  }
  if (passwordClassCount(value) < 2) {
    return isEn
      ? "Mix at least two kinds: letters, digits or symbols."
      : "Combinez au moins deux types : lettres, chiffres ou symboles.";
  }
  return undefined;
}
