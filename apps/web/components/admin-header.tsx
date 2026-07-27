"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, LogOut } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import { clearAuthStorage } from "../lib/auth";

export function AdminHeader() {
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const router = useRouter();
  const { user } = useAuth();

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearAuthStorage();
    router.push(authLoginUrl());
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-gold-500/15 bg-card/80 px-6 shadow-sm backdrop-blur-md sm:px-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4 text-gold-600 dark:text-gold-400" aria-hidden="true" />
        <span className="hidden sm:inline">
          {isEn ? "Restricted area — platform operators only" : "Espace restreint — opérateurs plateforme uniquement"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <span className="hidden max-w-[240px] truncate text-sm font-medium text-foreground md:inline">{user.email}</span>
        ) : null}
        <Link
          href="/admin/settings"
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
        >
          {isEn ? "Settings" : "Réglages"}
        </Link>
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-all hover:text-destructive active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("nav.logout")}
        </button>
      </div>
    </header>
  );
}
