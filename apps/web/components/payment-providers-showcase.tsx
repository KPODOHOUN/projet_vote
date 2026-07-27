"use client";

import { CheckCircle2, Clock3 } from "lucide-react";
import { PAYMENT_PROVIDERS } from "../lib/payment-providers";
import { GlassCard } from "./glass-card";

type PaymentProvidersShowcaseProps = {
  isEn?: boolean;
  compact?: boolean;
};

export function PaymentProvidersShowcase({ isEn = false, compact = false }: PaymentProvidersShowcaseProps) {
  return (
    <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
      {PAYMENT_PROVIDERS.map((provider) => (
        <GlassCard
          key={provider.id}
          hover={provider.available}
          intensity={provider.available ? "default" : "subtle"}
          className={`relative flex h-full flex-col p-5 ${!provider.available ? "opacity-90" : ""}`}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl text-sm font-black text-white shadow-md ring-2 ring-white/20 overflow-hidden ${provider.logoUrl ? 'bg-white' : ''}`}
              style={provider.logoUrl ? undefined : { backgroundColor: provider.accent }}
              aria-hidden="true"
            >
              {provider.logoUrl ? (
                <img src={provider.logoUrl} alt={provider.name} className="h-full w-full object-contain p-1.5" />
              ) : (
                provider.name.slice(0, 2).toUpperCase()
              )}
            </div>
            {provider.available ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {isEn ? "Active" : "Actif"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                {isEn ? "Soon" : "Bientôt"}
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-foreground">{provider.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{isEn ? provider.taglineEn : provider.taglineFr}</p>
          <p className="mt-3 text-xs font-medium text-foreground/80">
            {isEn ? "Networks:" : "Réseaux :"}{" "}
            <span className="text-muted-foreground">{isEn ? provider.networksEn : provider.networksFr}</span>
          </p>
        </GlassCard>
      ))}
    </div>
  );
}
