"use client";

import {
  createContext,
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

function AuthModalProviderInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const authFromUrl = parseAuthMode(searchParams.get(AUTH_QUERY_PARAM));
  const nextFromUrl = sanitizeAuthReturnTo(searchParams.get(AUTH_NEXT_PARAM));

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    if (authFromUrl) {
      setMode(authFromUrl);
      setOpen(true);
      setReturnTo(nextFromUrl);
    }
  }, [authFromUrl, nextFromUrl]);

  const clearAuthQuery = useCallback(() => {
    if (!searchParams.get(AUTH_QUERY_PARAM) && !searchParams.get(AUTH_NEXT_PARAM)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(AUTH_QUERY_PARAM);
    params.delete(AUTH_NEXT_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const openAuth = useCallback(
    (nextMode: AuthMode, next?: string | null) => {
      setMode(nextMode);
      setOpen(true);
      setReturnTo(sanitizeAuthReturnTo(next ?? null));
    },
    []
  );

  const closeAuth = useCallback(() => {
    setOpen(false);
    clearAuthQuery();
  }, [clearAuthQuery]);

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

  const value = useMemo(
    () => ({ openAuth, closeAuth, returnTo }),
    [openAuth, closeAuth, returnTo]
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthDialog
        open={open}
        onOpenChange={handleOpenChange}
        initialMode={mode}
        returnTo={returnTo}
      />
    </AuthModalContext.Provider>
  );
}

export function AuthModalProvider({ children }: { children: ReactNode }) {
  return <AuthModalProviderInner>{children}</AuthModalProviderInner>;
}
