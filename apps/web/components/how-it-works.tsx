"use client";

import { CreditCard, Share2, Trophy, UserPlus } from "lucide-react";
import { GlassCard } from "./glass-card";

type HowItWorksProps = {
  isEn?: boolean;
};

const STEPS = [
  {
    icon: UserPlus,
    titleFr: "Créez votre espace",
    titleEn: "Create your workspace",
    descFr: "Inscription en 2 minutes + confirmation par e-mail.",
    descEn: "Sign up in 2 minutes + email confirmation."
  },
  {
    icon: Trophy,
    titleFr: "Lancez votre concours",
    titleEn: "Launch your contest",
    descFr: "Ajoutez vos candidates, personnalisez la page, activez gratuitement.",
    descEn: "Add candidates, customize your page, activate for free."
  },
  {
    icon: Share2,
    titleFr: "Partagez le lien",
    titleEn: "Share the link",
    descFr: "Envoyez le lien public à votre audience — aucun compte requis pour voter.",
    descEn: "Send the public link to your audience — no account needed to vote."
  },
  {
    icon: CreditCard,
    titleFr: "Encaissez via Mobile Money",
    titleEn: "Collect via Mobile Money",
    descFr: "FeexPay, KkiaPay, FedaPay ou SebPay (bientôt).",
    descEn: "FeexPay, KkiaPay, FedaPay or SebPay (soon)."
  }
] as const;

export function HowItWorks({ isEn = false }: HowItWorksProps) {
  return (
    <ol className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 relative">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={step.titleFr} className="relative group">
            {/* Connecting line on desktop */}
            {index < STEPS.length - 1 && (
              <div className="hidden lg:block absolute top-[28px] left-[65%] w-[70%] h-[1.5px] bg-gradient-to-r from-primary/30 via-primary/10 to-transparent z-0 pointer-events-none" />
            )}
            <GlassCard hover intensity="default" className="relative h-full p-6 border border-border/40 hover:border-primary/25 transition-all duration-300 z-10 bg-card/5 hover:shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-xs font-black text-primary border border-primary/25 shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  0{index + 1}
                </span>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/5 text-primary border border-primary/10 group-hover:scale-105 group-hover:bg-primary/10 transition-transform duration-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
              <h3 className="text-base font-extrabold text-foreground tracking-tight group-hover:text-primary transition-colors">{isEn ? step.titleEn : step.titleFr}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{isEn ? step.descEn : step.descFr}</p>
            </GlassCard>
          </li>
        );
      })}
    </ol>
  );
}
