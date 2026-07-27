"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Input, KpiCard, StatusChip, LoadingState } from "@/components/ui";
import { showToast } from "@/lib/toast";
import { AdminErrorAlert, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";
import { ShieldCheck, CreditCard, Sparkles, Save, Check } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";

type AccountSubscription = {
  id: string;
  tenantId: string;
  planType: "STANDARD" | "PARTNER";
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  startsAt: string;
  expiresAt: string;
  durationMonths: number;
  priceCfa: number | null;
  frozenCommissionBps: number;
  tenant: {
    displayName: string;
    slug: string;
  };
};

type PricingItem = {
  durationMonths: number;
  priceCfa: number;
  active: boolean;
};

export default function DashboardAdminSubscriptionsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [subscriptions, setSubscriptions] = useState<AccountSubscription[]>([]);
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [pricingSaveSuccess, setPricingSaveSuccess] = useState(false);
  const [actionSubId, setActionSubId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"activate" | "suspend" | "renew" | null>(null);
  const [renewMonths, setRenewMonths] = useState(6);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    try {
      const [subs, priceList] = await Promise.all([
        apiFetch<AccountSubscription[]>("/subscriptions/admin/list", {
          headers: { Authorization: `Bearer ${token}` }
        }),
        apiFetch<PricingItem[]>("/subscriptions/admin/pricing", {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setSubscriptions(subs);
      setPricing(priceList);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [router]);

  const handlePriceChange = (index: number, field: keyof PricingItem, value: string | number) => {
    setPricing((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value } as PricingItem;
      return copy;
    });
  };

  const savePricing = async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsSavingPricing(true);
    setError("");
    setPricingSaveSuccess(false);
    try {
      await apiFetch("/subscriptions/admin/pricing", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ items: pricing })
      });
      setPricingSaveSuccess(true);
      setTimeout(() => setPricingSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde");
    } finally {
      setIsSavingPricing(false);
    }
  };

  if (isLoading) {
    return <LoadingState label={isEn ? "Loading dashboard data..." : "Chargement des données..."} />;
  }

  const activeSubs = subscriptions.filter(s => s.status === "ACTIVE");
  const totalStandardRevenue = subscriptions
    .filter(s => s.planType === "STANDARD" && s.priceCfa)
    .reduce((acc, s) => acc + (s.priceCfa || 0), 0);

  const performAction = async () => {
    if (!actionSubId || !actionType) return;
    const token = getStoredToken();
    if (!token) return;
    setActionLoading(true);
    try {
      if (actionType === "renew") {
        await apiFetch(`/admin/subscriptions/${actionSubId}/renew`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ durationMonths: renewMonths })
        });
      } else {
        await apiFetch(`/admin/subscriptions/${actionSubId}/${actionType}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      showToast.success(isEn ? "Subscription updated." : "Abonnement mis à jour.");
      setActionSubId(null);
      setActionType(null);
      loadData();
    } catch { showToast.error(isEn ? "Action failed." : "Action échouée."); }
    finally { setActionLoading(false); }
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Subscriptions Admin" : "Abonnements Admin"}
        title={isEn ? "Organizer Subscriptions" : "Gestion des Abonnements"}
        description={
          isEn
            ? "Configure pricing plans, view active subscriptions, and track account plan limits."
            : "Configurez la grille tarifaire, gérez les abonnements actifs et suivez le statut d'accès des organisateurs."}
      />

      {error && <AdminErrorAlert message={error} />}

      <div className="space-y-10">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KpiCard
            label={isEn ? "Total Active Plans" : "Abonnements actifs"}
            value={String(activeSubs.length)}
          />
          <KpiCard
            label={isEn ? "Partner accounts" : "Comptes Partenaires"}
            value={String(activeSubs.filter(s => s.planType === "PARTNER").length)}
          />
          <KpiCard
            label={isEn ? "Total standard revenue" : "Chiffre d'affaires Standard"}
            value={`${totalStandardRevenue.toLocaleString("fr-FR")} CFA`}
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Subscriptions List */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-extrabold text-xl text-foreground">
              {isEn ? "Active Subscriptions" : "Abonnements en cours"}
            </h3>

            {subscriptions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground border border-dashed rounded-2xl bg-card">
                {isEn ? "No subscriptions recorded." : "Aucun abonnement enregistré."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                        <th className="p-4">{isEn ? "Tenant" : "Organisateur"}</th>
                        <th className="p-4">{isEn ? "Plan" : "Formule"}</th>
                        <th className="p-4">{isEn ? "Expires At" : "Expiration"}</th>
                        <th className="p-4">{isEn ? "Comm." : "Comm."}</th>
                        <th className="p-4">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {subscriptions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-foreground">
                              {sub.tenant?.displayName || sub.tenantId}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              slug: {sub.tenant?.slug || "unknown"}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="flex items-center gap-1 font-medium text-foreground">
                              {sub.planType === "PARTNER" ? (
                                <>
                                  <ShieldCheck className="w-4 h-4 text-primary" />
                                  {isEn ? "Partner" : "Partenaire"}
                                </>
                              ) : (
                                <>
                                  <CreditCard className="w-4 h-4 text-primary" />
                                  Standard
                                </>
                              )}
                            </span>
                            {sub.priceCfa && (
                              <div className="text-xs text-muted-foreground">
                                {sub.priceCfa.toLocaleString()} CFA
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {new Date(sub.expiresAt).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="p-4 font-bold text-foreground">
                            {sub.frozenCommissionBps / 100}%
                          </td>
                          <td className="p-4">
                            <StatusChip
                              label={sub.status}
                              tone={sub.status === "ACTIVE" ? "success" : "warning"}
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex gap-1">
                              {sub.status !== "ACTIVE" && (
                                <Button size="sm" variant="secondary" onClick={() => { setActionSubId(sub.id); setActionType("activate"); }}>
                                  {isEn ? "Activate" : "Activer"}
                                </Button>
                              )}
                              {sub.status === "ACTIVE" && (
                                <Button size="sm" variant="secondary" onClick={() => { setActionSubId(sub.id); setActionType("suspend"); }}>
                                  {isEn ? "Suspend" : "Suspendre"}
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" onClick={() => { setActionSubId(sub.id); setActionType("renew"); setRenewMonths(sub.durationMonths); }}>
                                {isEn ? "Renew" : "Renouveler"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Config Grid */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6 self-start">
            <div className="space-y-1">
              <h3 className="font-extrabold text-xl text-foreground">
                {isEn ? "Pricing Settings" : "Tarification Standard"}
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {isEn
                  ? "Define the prices for different Standard plan durations."
                  : "Modifiez le montant en CFA des abonnements Standard."}
              </p>
            </div>

            <div className="space-y-4">
              {pricing.map((item, index) => (
                <div key={item.durationMonths} className="flex items-center gap-3 border-b border-border/80 pb-4">
                  <div className="w-16 shrink-0 font-bold text-sm text-foreground">
                    {item.durationMonths} {isEn ? "M" : "Mois"}
                  </div>
                  <div className="flex-1">
                    <Input
                      id={`price-${item.durationMonths}`}
                      label={isEn ? "Price" : "Prix"}
                      type="number"
                      placeholder="Prix CFA"
                      value={item.priceCfa}
                      onChange={(e) => handlePriceChange(index, "priceCfa", Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center shrink-0">
                    <input
                      id={`active-${item.durationMonths}`}
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) => handlePriceChange(index, "active", e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                    />
                  </div>
                </div>
              ))}

              <div className="pt-2 flex flex-col gap-2">
                <Button onClick={savePricing} disabled={isSavingPricing} className="w-full shadow-md font-bold">
                  {isSavingPricing ? (
                    isEn ? "Saving..." : "Enregistrement..."
                  ) : pricingSaveSuccess ? (
                    <>
                      <Check className="w-4 h-4 mr-1.5 stroke-[3]" />
                      {isEn ? "Saved !" : "Enregistré !"}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1.5" />
                      {isEn ? "Save Pricing" : "Enregistrer les tarifs"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setActionType(null); setActionSubId(null); }}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">
              {actionType === "activate" ? (isEn ? "Activate subscription" : "Activer l'abonnement") :
               actionType === "suspend" ? (isEn ? "Suspend subscription" : "Suspendre l'abonnement") :
               (isEn ? "Renew subscription" : "Renouveler l'abonnement")}
            </h3>
            {actionType === "renew" && (
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-1 block">
                  {isEn ? "Duration (months)" : "Durée (mois)"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={renewMonths}
                  onChange={(e) => setRenewMonths(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={performAction} loading={actionLoading}>
                {actionType === "activate" ? (isEn ? "Activate" : "Activer") :
                 actionType === "suspend" ? (isEn ? "Suspend" : "Suspendre") :
                 (isEn ? "Renew" : "Renouveler")}
              </Button>
              <Button variant="secondary" onClick={() => { setActionType(null); setActionSubId(null); }}>
                {isEn ? "Cancel" : "Annuler"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
