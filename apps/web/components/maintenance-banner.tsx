"use client";

import { useEffect, useState } from "react";
import { fetchMaintenanceStatus } from "@/lib/platform-maintenance";

export function MaintenanceBanner() {
  const [status, setStatus] = useState<{ enabled: boolean; message: string } | null>(null);

  useEffect(() => {
    void fetchMaintenanceStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status?.enabled) return null;

  return (
    <div
      className="border-b border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-center text-sm font-medium text-[var(--color-warning-text)]"
      role="status"
    >
      {status.message}
    </div>
  );
}
