"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import { apiFetch } from "../lib/api";
import { clearAuthStorage } from "../lib/auth";
import { UserMenu } from "./user-menu";

export function AdminHeader() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const router = useRouter();
  const queryClient = useQueryClient();

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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-2 border-b border-gold-500/20 bg-background pl-[4.5rem] pr-3 sm:pr-6 lg:px-8">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
        <Shield className="size-4 text-gold-600" aria-hidden="true" />
        {isEn ? "Admin area" : "Espace admin"}
      </span>
      <UserMenu
        settingsHref="/admin/settings"
        settingsLabel={isEn ? "Settings" : "Réglages"}
        onLogout={logout}
      />
    </header>
  );
}
