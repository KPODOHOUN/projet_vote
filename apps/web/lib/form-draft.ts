const DRAFT_PREFIX = "vp.draft.";

export function saveFormDraft<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function loadFormDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${DRAFT_PREFIX}${key}`);
}

export function createDebouncedDraftSaver<T>(key: string, delayMs = 1000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (value: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveFormDraft(key, value), delayMs);
  };
}
