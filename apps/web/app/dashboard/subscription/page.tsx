"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { useSubscriptionUsage } from "../../../lib/hooks/use-subscription";
import { Button, LoadingState, StatusChip } from "@/components/ui";
import { Calendar, CreditCard, Sparkles, AlertTriangle, ArrowRight, ShieldCheck, History, Gauge, Infinity as InfinityIcon } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";

type SubscriptionProgress = {
  daysRemaining: number;
  totalDays: number;
  progressPercent: number;
};

type AccountSubscription = {
  id: string;
  planType: "STANDARD" | "PARTNER";
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  startsAt: string;
  expiresAt: string;
  durationMonths: number;
  priceCfa: number | null;
  frozenCommissionBps: number;
  partnerCommissionBps: number | null;
};

type SubscriptionMeResponse = {
  current: AccountSubscription | null;
  past: AccountSubscription[];
  progress: SubscriptionProgress | null;
};

export default function DashboardSubscriptionPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [data, setData] = useState<SubscriptionMeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const usageQuery = useSubscriptionUsage(true);

  const loadData = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    try {
      const res = await apiFetch<SubscriptionMeResponse>("/subscriptions/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (isLoading) {
    return <LoadingState label={isEn ? "Loading subscriptions..." : "Chargement des abonnements..."} />;
  }

  const { current, past, progress } = data || { current: null, past: [], progress: null };
  const usage = usageQuery.data;
  const commissionBps = usage?.commissionRate ?? current?.frozenCommissionBps ?? null;
  const commissionLabel = commissionBps != null ? `${(commissionBps / 100).toFixed(commissionBps % 100 === 0 ? 0 : 1)}%` : "—";
  const planTitle =
    usage?.planName ??
    (current?.planType === "PARTNER"
      ? isEn ? "Platform Partner" : "Partenaire Plateforme"
      : isEn ? "Standard Member" : "Abonnement Standard");
  const eventsLimit = usage?.eventsLimit ?? null;
  const eventsUsed = usage?.eventsUsed ?? 0;
  const eventsPercent =
    eventsLimit != null && eventsLimit > 0 ? Math.min(100, Math.round((eventsUsed / eventsLimit) * 100)) : 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {isEn ? "My Subscription" : "Mon abonnement"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isEn
            ? "Manage your account plan, features access and billing details."
            : "Gérez la formule d'accès de votre compte, les fonctionnalités autorisées et votre facturation."}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Active Subscription Banner or Selection Options */}
      {!current ? (
        <div className="rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Sparkles className="w-48 h-48" />
          </div>
          <div className="space-y-3 z-10 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[var(--color-warning-text)] font-semibold text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              {isEn ? "No active plan" : "Aucun plan actif"}
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              {isEn ? "Subscribe to activate event features" : "Souscrivez pour débloquer votre compte"}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {isEn
                ? "Your account currently has no active subscription. You cannot create new events or receive paid votes. Standard subscription unlocks full platform capabilities."
                : "Votre compte est actuellement sans forfait actif. Vous ne pouvez plus créer de nouveaux concours ou collecter des votes payants. Choisissez une option ci-dessous pour débloquer vos fonctionnalités."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0 z-10">
            <Link href="/dashboard/subscription/subscribe">
              <Button size="lg" className="w-full sm:w-auto shadow-md">
                {isEn ? "Choose standard plan" : "Formules Standard"}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/dashboard/subscription/partner">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                {isEn ? "Apply for partnership" : "Devenir Partenaire"}
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Plan Card */}
          <div className="lg:col-span-2 rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-primary/5 p-6 md:p-8 shadow-md relative overflow-hidden flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {isEn ? "Current plan" : "Formule active"}
                  </span>
                  <h2 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
                    {current.planType === "PARTNER" ? (
                      <>
                        <ShieldCheck className="w-7 h-7 text-primary" />
                        {planTitle}
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-7 h-7 text-primary" />
                        {planTitle}
                      </>
                    )}
                  </h2>
                </div>
                <StatusChip label={isEn ? "Active" : "Actif"} tone="success" />
              </div>

              {/* Progress bar */}
              {progress && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-muted-foreground">
                      {isEn ? "Time remaining" : "Temps restant"}
                    </span>
                    <span className="text-foreground">
                      {isEn
                        ? `${progress.daysRemaining} days of ${progress.totalDays} remaining`
                        : `${progress.daysRemaining} jours restants sur ${progress.totalDays}`}
                    </span>
                  </div>
                  <div className="w-full bg-border/60 rounded-full h-3.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary to-primary-container h-full transition-all duration-500 ease-out"
                      style={{ width: `${100 - progress.progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-4 pt-4 border-t border-border/80 text-sm text-muted-foreground justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary" />
                <span>
                  {isEn ? "Expires on " : "Expire le "}
                  <strong className="text-foreground">
                    {new Date(current.expiresAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>
                  {isEn ? "Commission: " : "Commission : "}
                  <strong className="text-foreground">{commissionLabel}</strong>
                </span>
              </div>
              <div>
                <Link href="/dashboard/subscription/subscribe">
                  <Button variant="secondary" size="sm">
                    {isEn ? "Renew subscription" : "Renouveler l'abonnement"}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Usage / Privileges */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              {isEn ? "Your usage" : "Votre utilisation"}
            </h3>

            {usageQuery.isLoading ? (
              <div className="space-y-3 animate-pulse" aria-hidden="true">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3.5 w-full rounded-full bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </div>
            ) : usageQuery.isError ? (
              <p role="alert" className="text-sm text-[var(--color-error-text)]">
                {isEn
                  ? "Unable to load your usage. Please retry."
                  : "Impossible de charger votre utilisation. Réessayez."}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="text-muted-foreground">{isEn ? "Events created" : "Événements créés"}</span>
                    <span className="inline-flex items-center gap-1 text-foreground">
                      {eventsLimit == null ? (
                        <>
                          <InfinityIcon className="w-4 h-4 text-primary" aria-hidden="true" />
                          {eventsUsed} · {isEn ? "Unlimited" : "Illimité"}
                        </>
                      ) : (
                        `${eventsUsed} / ${eventsLimit}`
                      )}
                    </span>
                  </div>
                  {eventsLimit != null && (
                    <div
                      className="w-full bg-border/60 rounded-full h-3 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={eventsLimit}
                      aria-valuenow={eventsUsed}
                      aria-label={isEn ? "Events used out of plan limit" : "Événements utilisés sur la limite du plan"}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          eventsPercent >= 100
                            ? "bg-[var(--color-error)]"
                            : eventsPercent >= 80
                              ? "bg-[var(--color-warning)]"
                              : "bg-primary"
                        }`}
                        style={{ width: `${eventsPercent}%` }}
                      />
                    </div>
                  )}
                  {eventsLimit != null && eventsPercent >= 100 && (
                    <p className="text-xs font-medium text-[var(--color-warning-text)]">
                      {isEn
                        ? "Plan limit reached — upgrade to create more events."
                        : "Limite du plan atteinte — passez à un plan supérieur pour créer plus d'événements."}
                    </p>
                  )}
                </div>

                <ul className="space-y-3 text-sm border-t border-border pt-3">
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-[var(--color-success)]">✓</span>
                    <span>{isEn ? "Accept paid votes via Mobile Money" : "Réception des votes payés (Mobile Money)"}</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-bold text-[var(--color-success)]">✓</span>
                    <span>
                      {isEn
                        ? `Commission rate locked at ${commissionLabel}`
                        : `Commission bloquée à ${commissionLabel}`}
                    </span>
                  </li>
                  {current.planType === "PARTNER" ? (
                    <li className="flex items-start gap-2.5 border-t border-border pt-2 text-muted-foreground text-xs leading-relaxed">
                      <span>ℹ</span>
                      <span>
                        {isEn
                          ? "Partner benefit: ongoing events stay open for votes until their schedule ends, even if the partnership period expires."
                          : "Avantage partenaire : vos concours déjà en cours restent ouverts aux votes jusqu'à la fin prévue, même après l'expiration."}
                      </span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2.5 border-t border-border pt-2 text-muted-foreground text-xs leading-relaxed">
                      <span>ℹ</span>
                      <span>
                        {isEn
                          ? "Standard status: upon expiration, vote reception and event creation are immediately suspended."
                          : "Statut Standard : à l'expiration, la réception des votes et la création de concours sont immédiatement suspendues."}
                      </span>
                    </li>
                  )}
                </ul>

                {eventsLimit != null && (
                  <Link href="/pricing" className="block">
                    <Button variant="secondary" size="sm" className="w-full">
                      {isEn ? "Compare plans" : "Comparer les plans"}
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* History of subscriptions */}
      <div className="space-y-4">
        <h3 className="font-bold text-xl text-foreground flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          {isEn ? "Billing History" : "Historique des abonnements"}
        </h3>
        
        {past.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground rounded-2xl border border-dashed border-border bg-card">
            {isEn ? "No past subscriptions." : "Aucun historique d'abonnement."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <th className="p-4">{isEn ? "Plan Type" : "Formule"}</th>
                    <th className="p-4">{isEn ? "Duration" : "Durée"}</th>
                    <th className="p-4">{isEn ? "Paid Amount" : "Montant"}</th>
                    <th className="p-4">{isEn ? "Expiration Date" : "Date d'expiration"}</th>
                    <th className="p-4">{isEn ? "Status" : "Statut"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {past.map((sub) => (
                    <tr key={sub.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-semibold text-foreground">
                        {sub.planType === "PARTNER" ? (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                            {isEn ? "Partner" : "Partenaire"}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <CreditCard className="w-4 h-4 text-primary" />
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {sub.durationMonths} {isEn ? "months" : "mois"}
                      </td>
                      <td className="p-4 text-foreground font-medium">
                        {sub.priceCfa ? `${sub.priceCfa.toLocaleString()} CFA` : "—"}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(sub.expiresAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                      </td>
                      <td className="p-4">
                        <StatusChip
                          label={sub.status}
                          tone={sub.status === "EXPIRED" ? "warning" : "error"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
