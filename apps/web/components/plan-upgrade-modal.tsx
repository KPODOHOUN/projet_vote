"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../lib/i18n-provider";
import { apiFetch } from "../lib/api";
import { X, Check, Loader2, ArrowUpRight } from "lucide-react";

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
    commissionRate: number;
    isActive: boolean;
    sortOrder: number;
    features: string[] | null;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PlanUpgradeModalProps = {
    isOpen: boolean;
    onClose: () => void;
    currentPlanName?: string;
    currentEventsCount?: number;
    currentEventsLimit?: number;
    isEn?: boolean;
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
// Component
// ---------------------------------------------------------------------------

export function PlanUpgradeModal({
    isOpen,
    onClose,
    currentPlanName,
    currentEventsCount = 0,
    currentEventsLimit = 1,
    isEn: propIsEn
}: PlanUpgradeModalProps) {
    const { locale } = useI18n();
    const isEn = propIsEn ?? locale === "en";

    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        setError("");
        apiFetch<Plan[]>("/plans")
            .then((data) => setPlans(data.filter((p: any) => p.priceCfa > 0 && p.isActive)))
            .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
            .finally(() => setIsLoading(false));
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card p-8 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={isEn ? "Upgrade your plan" : "Améliorez votre plan"}
                    >
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        {/* Header */}
                        <div className="mb-8 text-center">
                            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                                {isEn ? "Upgrade" : "Améliorer"}
                            </div>
                            <h2 className="text-2xl font-extrabold text-foreground">
                                {isEn ? "You've reached the limit of your plan" : "Vous avez atteint la limite de votre plan"}
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                                {currentPlanName && (
                                    <span>
                                        {isEn ? (
                                            <>Your current plan <strong>{currentPlanName}</strong> allows {currentEventsLimit} event(s). You have {currentEventsCount} event(s).</>
                                        ) : (
                                            <>Votre plan actuel <strong>{currentPlanName}</strong> autorise {currentEventsLimit} événement(s). Vous en avez {currentEventsCount}.</>
                                        )}
                                    </span>
                                )}
                                <br />
                                {isEn
                                    ? "Upgrade to a paid plan to create more events and benefit from lower commissions."
                                    : "Passez à un plan payant pour créer plus d'événements et bénéficier de commissions réduites."}
                            </p>
                        </div>

                        {/* Loading */}
                        {isLoading && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center text-sm font-medium text-destructive">
                                {error}
                            </div>
                        )}

                        {/* Plans grid */}
                        {!isLoading && !error && plans.length > 0 && (
                            <div className="grid gap-6 md:grid-cols-3">
                                {plans.map((plan, idx) => (
                                    <motion.div
                                        key={plan.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="flex flex-col rounded-2xl border border-border/50 bg-card/50 p-6 hover:border-primary/30 transition-all duration-300"
                                    >
                                        <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                                        <div className="mt-3 flex items-baseline gap-1">
                                            <span className="text-3xl font-extrabold text-foreground">
                                                {formatCfa(plan.priceCfa)}
                                            </span>
                                            <span className="text-sm text-muted-foreground">FCFA/mois</span>
                                        </div>

                                        <div className="my-4 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    {isEn ? "Commission" : "Commission"}
                                                </span>
                                                <span className="font-bold text-foreground">
                                                    {commissionPercent(plan.commissionRate)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    {isEn ? "Events" : "Événements"}
                                                </span>
                                                <span className="font-bold text-foreground">
                                                    {plan.maxEvents === null
                                                        ? isEn ? "Unlimited" : "Illimité"
                                                        : plan.maxEvents}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Savings */}
                                        {plan.commissionRate < 1500 && (
                                            <p className="mb-4 text-xs text-green-600 dark:text-green-400 font-semibold">
                                                {isEn
                                                    ? `Save ${commissionPercent(1500 - plan.commissionRate)}% commission vs Free`
                                                    : `Économisez ${commissionPercent(1500 - plan.commissionRate)}% de commission vs Free`}
                                            </p>
                                        )}

                                        {plan.features && plan.features.length > 0 && (
                                            <ul className="mb-6 flex-1 space-y-2">
                                                {plan.features.slice(0, 3).map((feature) => (
                                                    <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                                                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                                        <span>{feature}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        <Link
                                            href="/dashboard/subscription/subscribe"
                                            className="mt-auto inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                                        >
                                            {isEn ? "Choose this plan" : "Choisir ce plan"}
                                            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="mt-8 text-center">
                            <p className="text-xs text-muted-foreground">
                                {isEn ? (
                                    <>
                                        Questions about plans?{" "}
                                        <Link href="/legal" className="font-semibold text-primary hover:underline">Contact us</Link>
                                    </>
                                ) : (
                                    <>
                                        Des questions sur les plans ?{" "}
                                        <Link href="/legal" className="font-semibold text-primary hover:underline">Contactez-nous</Link>
                                    </>
                                )}
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

