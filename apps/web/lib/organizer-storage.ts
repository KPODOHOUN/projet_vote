const ORG_CODE_KEY = "vp.organizer.orgCode";

export function getRememberedOrgCode(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ORG_CODE_KEY) ?? "";
}

export function rememberOrgCode(code: string): void {
  if (typeof window === "undefined") return;
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) return;
  window.localStorage.setItem(ORG_CODE_KEY, trimmed);
}

export function clearRememberedOrgCode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ORG_CODE_KEY);
}
