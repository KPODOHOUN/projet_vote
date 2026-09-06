"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth-context";
import { DashboardSidebar } from "../../components/dashboard-sidebar";
import { DashboardHeader } from "../../components/dashboard-header";
import { useOrganizerOffer } from "../../lib/hooks/use-organizer-offer";
import { useSubscriptionUsage } from "../../lib/hooks/use-subscription";
import { useI18n } from "../../lib/i18n-provider";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

function ExpiryWarningBanner({ days }: { days: number }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2.5 text-center text-sm text-[var(--color-warning-text)] flex items-center justify-center gap-2 font-medium">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{t("dash.banner.subExpiring", { days })}</span>
      <Link href="/dashboard/offer" className="underline font-bold hover:opacity-80 ml-1">
        {t("dash.banner.manageOffer")}
      </Link>
    </div>
  );
}

function SubscriptionBanner() {
  const offerQuery = useOrganizerOffer(true);
  const usageQuery = useSubscriptionUsage(true);
  if (offerQuery.isPending || usageQuery.isPending) return null;

  const offerType = offerQuery.data?.offerType;
  const days = usageQuery.data?.daysRemaining;
  const expiryBanner =
    usageQuery.data?.hasSubscription && days != null && days <= 7 ? (
      <ExpiryWarningBanner days={days} />
    ) : null;

  if (offerType === "ESCROW") {
    return expiryBanner;
  }

  // EXTERNAL ou inconnu : pas de bandeau destructive (le gate API n'est plus l'abonnement).
  return expiryBanner;
}

function DemoModeBanner() {
  const { t } = useI18n();
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="border-b border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-2 text-center text-sm text-[var(--color-warning-text)]">
      {t("dash.banner.demoMode")}
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
            <div className="mx-auto max-w-container-wide p-6 md:p-10 lg:p-12">{children}</div>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
