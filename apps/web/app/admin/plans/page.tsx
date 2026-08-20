"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui";

/** Plans product path replaced by Offers — redirect. */
export default function AdminPlansRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/offers");
  }, [router]);
  return <LoadingState label="Redirection…" />;
}
