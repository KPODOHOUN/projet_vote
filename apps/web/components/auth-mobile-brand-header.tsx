"use client";

import Link from "next/link";
import { useI18n } from "../lib/i18n-provider";

type AuthMobileBrandHeaderProps = {
  className?: string;
};

export function AuthMobileBrandHeader({ className = "" }: AuthMobileBrandHeaderProps) {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <div className={className}>
      <Link href="/" className="inline-flex items-center gap-3 transition-opacity hover:opacity-80" aria-label="SHADOMA Votes">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-tighter text-primary-foreground"
          aria-hidden="true"
        >
          SV
        </span>
        <div className="flex flex-col">
          <strong className="text-sm font-bold leading-none tracking-tight text-foreground">SHADOMA Votes</strong>
          <small className="mt-1 text-[10px] font-medium leading-none text-muted-foreground">
            {isEn ? "Trusted vote platform" : "Plateforme de vote de confiance"}
          </small>
        </div>
      </Link>
    </div>
  );
}
