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
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "./api";
import { restoreSession, getStoredToken, clearAuthStorage } from "./auth";
import { authLoginUrl } from "./auth-navigation";
import { LoadingState } from "@/components/ui";

export type UserRole = "PLATFORM_ADMIN" | "PLATFORM_SUPER_ADMIN" | "ORGANIZER_OWNER" | "ORGANIZER_STAFF";

export type AuthUser = {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  role: UserRole | null;
  isLoading: boolean;
  isPlatformAdmin: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function getAccessToken(): Promise<string | null> {
  // Essaye d'abord le token en mémoire
  const memToken = getStoredToken();
  if (memToken) return memToken;

  // Sinon, tente une restauration via cookie httpOnly
  const restored = await restoreSession();
  return restored ? getStoredToken() : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        if (!pathname?.startsWith("/admin")) {
          router.replace(authLoginUrl(pathname));
        }
        return;
      }

      const me = await apiFetch<AuthUser>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(me);
    } catch {
      clearAuthStorage();
      setUser(null);
      if (!pathname?.startsWith("/admin")) {
        router.replace(authLoginUrl(pathname));
      }
    } finally {
      setIsLoading(false);
    }
  }, [router, pathname]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const logout = useCallback(() => {
    clearAuthStorage();
    setUser(null);
    router.replace(authLoginUrl());
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isLoading,
      isPlatformAdmin:
        user?.role === "PLATFORM_ADMIN" || user?.role === "PLATFORM_SUPER_ADMIN",
      logout,
      refreshUser: loadUser
    }),
    [user, isLoading, logout, loadUser]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-8">
        <LoadingState variant="rows" count={3} label="Chargement de votre espace…" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
