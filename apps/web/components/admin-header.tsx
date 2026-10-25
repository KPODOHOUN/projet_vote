"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Shield, LogOut } from "lucide-react";
import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import { clearAuthStorage } from "../lib/auth";

export function AdminHeader() {
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearAuthStorage();
    queryClient.clear();
    router.push(authLoginUrl());
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-2 border-b border-gold-500/20 bg-background pl-[4.5rem] pr-3 sm:gap-4 sm:pr-8 lg:px-8">
      <div className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
        <Shield className="h-4 w-4 text-gold-600" aria-hidden="true" />
        <span className="hidden sm:inline">
          {isEn ? "Restricted area — platform operators only" : "Espace restreint — opérateurs plateforme uniquement"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <LanguageSwitcher />
        {user ? (
          <span className="hidden max-w-[240px] truncate text-sm font-medium text-foreground md:inline">{user.email}</span>
        ) : null}
        <Link
          href="/admin/settings"
          className="hidden min-h-11 items-center rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-accent hover:text-slate-900 sm:inline-flex"
        >
          {isEn ? "Settings" : "Réglages"}
        </Link>
        <button
          type="button"
          onClick={logout}
          aria-label={t("nav.logout")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-600 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-3"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("nav.logout")}</span>
        </button>
      </div>
    </header>
  );
}
