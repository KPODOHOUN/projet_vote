"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AUTH_NEXT_PARAM,
  AUTH_QUERY_PARAM,
  parseAuthMode,
  sanitizeAuthReturnTo
} from "../../lib/auth-navigation";
import { AuthDialog, type AuthMode } from "./auth-dialog";

type AuthModalContextValue = {
  openAuth: (mode: AuthMode, next?: string | null) => void;
  closeAuth: () => void;
  returnTo: string | null;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error("useAuthModal must be used within AuthModalProvider");
  }
  return ctx;
}

/** Optionnel : hors provider (pages sans modal). */
export function useAuthModalOptional(): AuthModalContextValue | null {
  return useContext(AuthModalContext);
}

type UrlSyncProps = {
  open: boolean;
  onOpenFromUrl: (mode: AuthMode, next: string | null) => void;
};

/**
 * Synchronise le modal avec l'URL (`?auth=login|register&next=/…`).
 * Isolé sous sa propre boundary Suspense : `useSearchParams` l'exige, et une
 * boundary au-dessus de `{children}` (layout racine) amorçait le streaming
 * avant le rendu des pages — les `notFound()` arrivaient alors après l'envoi
 * des headers et les 404 devenaient des soft-200 (SEO + e2e).
 */
function AuthModalUrlSync({ open, onOpenFromUrl }: UrlSyncProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const authFromUrl = parseAuthMode(searchParams.get(AUTH_QUERY_PARAM));
  const nextFromUrl = sanitizeAuthReturnTo(searchParams.get(AUTH_NEXT_PARAM));

  // Deep-link entrant → ouvrir le modal.
  useEffect(() => {
    if (authFromUrl && !open) {
      onOpenFromUrl(authFromUrl, nextFromUrl);
    }
  }, [authFromUrl, nextFromUrl, open, onOpenFromUrl]);

  // Modal fermé → consommer les params auth de l'URL.
  useEffect(() => {
    if (open) return;
    if (!searchParams.get(AUTH_QUERY_PARAM) && !searchParams.get(AUTH_NEXT_PARAM)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(AUTH_QUERY_PARAM);
    params.delete(AUTH_NEXT_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [open, pathname, router, searchParams]);

  return null;
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const openAuth = useCallback((nextMode: AuthMode, next?: string | null) => {
    setMode(nextMode);
    setOpen(true);
    setReturnTo(sanitizeAuthReturnTo(next ?? null));
  }, []);

  const closeAuth = useCallback(() => {
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setOpen(true);
      } else {
        closeAuth();
      }
    },
    [closeAuth]
  );

  const handleOpenFromUrl = useCallback((urlMode: AuthMode, next: string | null) => {
    setMode(urlMode);
    setOpen(true);
    setReturnTo(next);
  }, []);

  const value = useMemo(
    () => ({ openAuth, closeAuth, returnTo }),
    [openAuth, closeAuth, returnTo]
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <AuthModalUrlSync open={open} onOpenFromUrl={handleOpenFromUrl} />
      </Suspense>
      <AuthDialog
        open={open}
        onOpenChange={handleOpenChange}
        initialMode={mode}
        returnTo={returnTo}
      />
    </AuthModalContext.Provider>
  );
}
