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
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm font-medium text-amber-900 dark:text-amber-200"
      role="status"
    >
      {status.message}
    </div>
  );
}
