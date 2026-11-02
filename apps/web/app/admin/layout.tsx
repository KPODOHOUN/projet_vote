"use client";

import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "../../lib/auth-context";
import { AdminSidebar } from "../../components/admin-sidebar";
import { AdminHeader } from "../../components/admin-header";
import { AdminLoginForm } from "../../components/admin-login-form";
import { AdminRouteGuard } from "../../components/admin-route-guard";
import { LoadingState } from "@/components/ui";

function AdminLayoutInner({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isLoading, isPlatformAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <LoadingState variant="rows" count={3} label="Chargement…" />
      </div>
    );
  }

  if (!user) {
    return <AdminLoginForm />;
  }
  if (!isPlatformAdmin) {
    return <AdminRouteGuard>{null}</AdminRouteGuard>;
  }

  return (
    <div className="flex min-h-dvh overflow-hidden bg-background">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto bg-background/50">
          <div className="mx-auto max-w-container-wide px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthProvider>
  );
}
