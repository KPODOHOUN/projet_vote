"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "../../lib/i18n-provider";
import { useAuthModal } from "../../components/auth/auth-modal-provider";
import { AmbientBackdrop } from "../../components/ambient-backdrop";
import { AppHeader } from "../../components/app-header";
import { apiFetch } from "../../lib/api";
import { Check, X, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCfa: number;
  maxEvents: number | null;
  commissionRate: number; // bps
  isActive: boolean;
  sortOrder: number;
  features: string[] | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCfa(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount);
}

function commissionPercent(bps: number): string {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// PlanCard Component
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  isPopular,
  isEn,
  onChoose
}: {
  plan: Plan;
  isPopular: boolean;
  isEn: boolean;
  onChoose: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className={`relative flex flex-col rounded-3xl border p-8 transition-all duration-300 ${
        isPopular
          ? "border-primary/40 bg-gradient-to-b from-primary/5 to-card shadow-xl shadow-primary/10 scale-105 z-10"
          : "border-border/50 bg-card/80 hover:border-primary/20"
      }`}
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-md">
          {isEn ? "Most Popular" : "Le Plus Populaire"}
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-2xl font-extrabold text-foreground">{plan.name}</h3>
        {plan.description && (
          <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
        )}
      </div>

      <div className="mb-8">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-extrabold text-foreground">
            {plan.priceCfa === 0 ? "0" : formatCfa(plan.priceCfa)}
          </span>
          {plan.priceCfa > 0 && (
            <span className="text-lg font-semibold text-muted-foreground">FCFA</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.priceCfa === 0
            ? isEn ? "Free forever" : "Gratuit à vie"
            : isEn ? "per month" : "par mois"}
        </p>
      </div>

      <div className="mb-8 space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {isEn ? "Commission" : "Commission"}
          </span>
          <span className="font-bold text-foreground">
            {commissionPercent(plan.commissionRate)}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            {isEn ? "Max Events" : "Max Événements"}
          </span>
          <span className="font-bold text-foreground">
            {plan.maxEvents === null
              ? isEn ? "Unlimited" : "Illimité"
              : plan.maxEvents}
          </span>
        </div>
      </div>

      {plan.features && plan.features.length > 0 && (
        <ul className="mb-8 flex-1 space-y-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 shrink-0 text-primary">
                <Check className="h-4 w-4 stroke-[3]" />
              </span>
              <span className="text-foreground/80">{feature}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onChoose}
        className={`mt-auto inline-flex h-12 w-full items-center justify-center rounded-full text-base font-bold transition-all ${
          isPopular
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
            : "border border-border bg-background/50 text-foreground hover:border-primary hover:bg-background"
        }`}
      >
        {plan.priceCfa === 0
          ? isEn ? "Get Started Free" : "Commencer Gratuitement"
          : isEn ? "Subscribe" : "S'abonner"}
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pricing Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const { openAuth } = useAuthModal();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Plan[]>("/plans")
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur de chargement"))
      .finally(() => setIsLoading(false));
  }, []);

  const popularSlug = "pro";

  return (
    <AmbientBackdrop variant="rich">
      <AppHeader />
      <main id="main-content" className="min-h-screen pt-28 pb-20">
        <div className="container px-4 md:px-6">
          {/* Header */}
          <header className="mx-auto mb-16 max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                {isEn ? "Pricing" : "Tarifs"}
              </span>
              <h1 className="text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">
                {isEn ? "Choose the plan that fits you" : "Choisissez le plan qui vous convient"}
              </h1>
              <p className="mx-auto max-w-xl text-base text-muted-foreground">
                {isEn
                  ? "Start for free. Upgrade as you grow. All plans include Mobile Money payments."
                  : "Commencez gratuitement. Évoluez selon vos besoins. Tous les plans incluent les paiements Mobile Money."}
              </p>
            </motion.div>
          </header>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-auto max-w-md rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {/* Plans Grid */}
          {!isLoading && !error && plans.length > 0 && (
            <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isPopular={plan.slug === popularSlug}
                  isEn={isEn}
                  onChoose={() => openAuth("register")}
                />
              ))}
            </div>
          )}

          {/* Commission explanation */}
          <section className="mx-auto mt-20 max-w-3xl">
            <div className="rounded-2xl border border-border/50 bg-card/50 p-8">
              <h2 className="mb-4 text-xl font-bold text-foreground">
                {isEn ? "How does the commission work?" : "Comment fonctionne la commission ?"}
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  {isEn
                    ? "A commission is applied to EVERY vote payment collected via Mobile Money, regardless of your plan. The percentage depends on your subscription plan."
                    : "Une commission est appliquée sur TOUS les paiements de votes collectés via Mobile Money, quel que soit votre plan. Le pourcentage dépend de votre formule d'abonnement."}
                </p>
                <p>
                  {isEn
                    ? "Example: For a 200 FCFA vote on the Free plan (15% commission), the platform takes 30 FCFA and you receive 170 FCFA. On the Pro plan (7%), you'd receive 186 FCFA."
                    : "Exemple : Pour un vote à 200 FCFA sur le plan Free (15% de commission), la plateforme prend 30 FCFA et vous recevez 170 FCFA. Sur le plan Pro (7%), vous recevriez 186 FCFA."}
                </p>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="mx-auto mt-12 max-w-3xl text-center">
            <p className="text-sm text-muted-foreground">
              {isEn ? (
                <>
                  Questions about our plans?{" "}
                  <Link href="/legal" className="font-semibold text-primary hover:underline">
                    Contact us
                  </Link>
                </>
              ) : (
                <>
                  Des questions sur nos formules ?{" "}
                  <Link href="/legal" className="font-semibold text-primary hover:underline">
                    Contactez-nous
                  </Link>
                </>
              )}
            </p>
          </section>
        </div>
      </main>
    </AmbientBackdrop>
  );
}

