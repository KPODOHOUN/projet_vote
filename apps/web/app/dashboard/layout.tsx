"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth-context";
import { DashboardSidebar } from "../../components/dashboard-sidebar";
import { DashboardHeader } from "../../components/dashboard-header";
import { useI18n } from "../../lib/i18n-provider";

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
          <main className="flex-1 overflow-y-auto bg-background/50">
            <div className="mx-auto max-w-container-wide px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
