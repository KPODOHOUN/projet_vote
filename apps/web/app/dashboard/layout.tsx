"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth-context";
import { DashboardSidebar } from "../../components/dashboard-sidebar";
import { DashboardHeader } from "../../components/dashboard-header";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getStoredToken } from "../../lib/auth";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

type SubscriptionMeResponse = {
  current: {
    planType: "STANDARD" | "PARTNER";
    expiresAt: string;
  } | null;
  progress: {
    daysRemaining: number;
  } | null;
};

function SubscriptionBanner() {
  const [data, setData] = useState<SubscriptionMeResponse | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    apiFetch<SubscriptionMeResponse>("/subscriptions/me", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(setData)
      .catch(err => console.error("Failed to load subscription info for banner:", err));
  }, []);

  if (!data) return null;

  const { current, progress } = data;

  if (!current) {
    return (
      <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive dark:text-destructive-foreground flex items-center justify-center gap-2 font-medium">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Aucun abonnement actif. Vous ne pouvez plus créer de concours ou recevoir des votes.</span>
        <Link href="/dashboard/subscription" className="underline font-bold hover:opacity-80 ml-1">
          Souscrire un plan
        </Link>
      </div>
    );
  }

  if (progress && progress.daysRemaining <= 7) {
    return (
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-900 dark:text-amber-100 flex items-center justify-center gap-2 font-medium">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Votre abonnement expire dans {progress.daysRemaining} jour(s). Pensez à le renouveler.</span>
        <Link href="/dashboard/subscription" className="underline font-bold hover:opacity-80 ml-1">
          Gérer mon offre
        </Link>
      </div>
    );
  }

  return null;
}

function DemoModeBanner() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-100">
      Mode démo actif — les paiements sont confirmés automatiquement (sans Mobile Money réel).
    </div>
  );
}

export default function DashboardLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <AuthProvider>
      <div className="flex min-h-dvh overflow-hidden bg-background">
        <DashboardSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader />
          <DemoModeBanner />
          <SubscriptionBanner />
          <main className="flex-1 overflow-y-auto bg-background/50">
            <div className="mx-auto max-w-container-max p-6 md:p-10 lg:p-12">{children}</div>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
