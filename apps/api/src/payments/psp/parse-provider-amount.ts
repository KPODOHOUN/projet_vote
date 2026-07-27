/** Montant PSP : rejette les chaînes ambiguës (ex. "500abc"). */
export function parseStrictProviderAmount(raw: string | number | undefined): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.trunc(raw) : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && String(n) === trimmed ? n : null;
  }
  return null;
}
