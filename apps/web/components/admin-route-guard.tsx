"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { showToast } from "../lib/toast";
import { LoadingState } from "@/components/ui";

type AdminRouteGuardProps = {
  children: ReactNode;
};

export function AdminRouteGuard({ children }: AdminRouteGuardProps) {
  const router = useRouter();
  const { isPlatformAdmin, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isPlatformAdmin) {
      showToast.error("Accès réservé aux administrateurs de la plateforme.");
      router.replace("/dashboard");
    }
  }, [isPlatformAdmin, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <LoadingState variant="rows" count={3} label="Vérification des droits…" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return null;
  }

  return <>{children}</>;
}
