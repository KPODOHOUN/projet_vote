"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Percent, Wallet } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  KpiCard,
  LoadingState,
  StatusChip
} from "@/components/ui";
import { AdminErrorAlert, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import {
  approvePartnerRequest,
  createOfferTier,
  deleteOfferTier,
  formatRevenueRange,
  listAdminOfferTiers,
  listPartnerEventsFinancials,
  listPartnerRequests,
  rejectPartnerRequest,
  type PartnerEventFinancials,
  type PartnerOfferTier,
  type PartnerRequestItem
} from "../../../lib/partners";
import { showToast } from "../../../lib/toast";

export default function DashboardAdminPartnersPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [tiers, setTiers] = useState<PartnerOfferTier[]>([]);
  const [requests, setRequests] = useState<PartnerRequestItem[]>([]);
  const [financials, setFinancials] = useState<PartnerEventFinancials[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [tierLabel, setTierLabel] = useState("");
  const [tierMin, setTierMin] = useState("");
  const [tierMax, setTierMax] = useState("");
  const [tierPercent, setTierPercent] = useState("");
  const [isSavingTier, setIsSavingTier] = useState(false);

  const [approveTierByRequest, setApproveTierByRequest] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const [t, reqs, fin] = await Promise.all([
      listAdminOfferTiers(token),
      listPartnerRequests(token, "PENDING"),
      listPartnerEventsFinancials(token)
    ]);
    setTiers(t);
    setRequests(reqs);
    setFinancials(fin);
  }, [router]);

  useEffect(() => {
    setIsLoading(true);
    void (async () => {
      try {
        await load();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : isEn
              ? "Unable to load partner data."
              : "Chargement partenaire impossible."
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [load, isEn]);

  async function onCreateTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setIsSavingTier(true);
    try {
      await createOfferTier(token, {
        label: tierLabel.trim(),
        minRevenueCfa: Number.parseInt(tierMin, 10),
        maxRevenueCfa: tierMax.trim() ? Number.parseInt(tierMax, 10) : null,
        platformShareBps: Math.round(Number.parseFloat(tierPercent.replace(",", ".")) * 100)
      });
      setTierLabel("");
      setTierMin("");
      setTierMax("");
      setTierPercent("");
      showToast.success(isEn ? "Tier saved." : "Palier enregistré.");
      await load();
    } catch (caughtError) {
      showToast.error(caughtError instanceof Error ? caughtError.message : "Erreur");
    } finally {
      setIsSavingTier(false);
    }
  }

  async function onDeleteTier(tierId: string) {
    const token = getStoredToken();
    if (!token) return;
    try {
      await deleteOfferTier(token, tierId);
      showToast.success(isEn ? "Tier removed." : "Palier supprimé.");
      await load();
    } catch (caughtError) {
      showToast.error(caughtError instanceof Error ? caughtError.message : "Erreur");
    }
  }

  async function onApprove(request: PartnerRequestItem) {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(request.id);
    try {
      const tierId = approveTierByRequest[request.id] ?? request.offerTier?.id;
      await approvePartnerRequest(token, request.id, {
        ...(tierId ? { offerTierId: tierId } : {}),
        ...(request.estimatedRevenueCfa != null
          ? { estimatedRevenueCfa: request.estimatedRevenueCfa }
          : {})
      });
      showToast.success(isEn ? "Partner offer approved." : "Offre partenaire approuvée.");
      await load();
    } catch (caughtError) {
      showToast.error(
        caughtError instanceof Error
          ? caughtError.message
          : isEn
            ? "Approval failed."
            : "Approbation impossible."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(requestId: string) {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(requestId);
    try {
      await rejectPartnerRequest(token, requestId, isEn ? "Not eligible" : "Non éligible");
      showToast.success(isEn ? "Request rejected." : "Demande refusée.");
      await load();
    } catch (caughtError) {
      showToast.error(caughtError instanceof Error ? caughtError.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  const totals = financials.reduce(
    (acc, row) => ({
      votes: acc.votes + row.votesGrossCfa,
      platform: acc.platform + row.platformCommissionCfa,
      organizer: acc.organizer + row.organizerNetPayableCfa
    }),
    { votes: 0, platform: 0, organizer: 0 }
  );

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Platform" : "Plateforme"}
        title={isEn ? "Partner plan" : "Formule partenaire"}
        description={
          isEn
            ? "Review launch-now-pay-later requests (processed within 24 to 72 hours) and track revenue per vote."
            : "Validez les demandes « lancer maintenant, payer plus tard » (traitées sous 24 à 72 h) et suivez les recettes par vote."
        }
      />

      {isLoading ? (
        <LoadingState variant="rows" count={4} label={isEn ? "Loading…" : "Chargement…"} />
      ) : (
        <>
          {error ? <AdminErrorAlert message={error} /> : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KpiCard
              label={isEn ? "Vote revenue (partner plan)" : "Recettes votes (partenaires)"}
              value={`${totals.votes.toLocaleString(isEn ? "en-GB" : "fr-FR")} FCFA`}
            />
            <KpiCard
              label={isEn ? "SHADOMA share" : "Part SHADOMA"}
              value={`${totals.platform.toLocaleString(isEn ? "en-GB" : "fr-FR")} FCFA`}
            />
            <KpiCard
              label={isEn ? "Paid to organizers" : "Versé aux organisateurs"}
              value={`${totals.organizer.toLocaleString(isEn ? "en-GB" : "fr-FR")} FCFA`}
            />
          </div>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="text-xl font-bold text-foreground">
                {isEn ? "Commission grid" : "Grille de commissions"}
              </h3>
            </div>
            <Card className="border border-border p-5 space-y-4">
              {tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isEn
                    ? "Set a revenue range and the commission SHADOMA keeps."
                    : "Définissez une fourchette de recettes et la commission SHADOMA."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold">{isEn ? "Label" : "Libellé"}</th>
                        <th className="px-4 py-3 font-semibold">{isEn ? "Revenue range" : "Fourchette recettes"}</th>
                        <th className="px-4 py-3 font-semibold">{isEn ? "SHADOMA %" : "Commission SHADOMA"}</th>
                        <th className="px-4 py-3 font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier) => (
                        <tr key={tier.id} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{tier.label}</td>
                          <td className="px-4 py-3">{formatRevenueRange(tier, isEn)}</td>
                          <td className="px-4 py-3">{(tier.platformShareBps / 100).toFixed(1)} %</td>
                          <td className="px-4 py-3 text-right">
                            <ConfirmDialog
                              title={isEn ? "Remove tier?" : "Supprimer le palier ?"}
                              description={
                                isEn
                                  ? `Remove "${tier.label}" from the partner program. Existing approved events keep their commission.`
                                  : `Retirer « ${tier.label} » du programme partenaire. Les évènements déjà approuvés conservent leur commission.`
                              }
                              confirmLabel={isEn ? "Remove" : "Supprimer"}
                              cancelLabel={isEn ? "Cancel" : "Annuler"}
                              onConfirm={() => void onDeleteTier(tier.id)}
                              trigger={<Button size="sm" variant="secondary">{isEn ? "Remove" : "Supprimer"}</Button>}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <form className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end" onSubmit={onCreateTier}>
                <Input id="tierLabel" label={isEn ? "Label" : "Libellé"} value={tierLabel} onChange={(e) => setTierLabel(e.target.value)} required />
                <Input id="tierMin" label={isEn ? "Min FCFA" : "Min FCFA"} value={tierMin} onChange={(e) => setTierMin(e.target.value)} required />
                <Input id="tierMax" label={isEn ? "Max FCFA" : "Max FCFA"} helpText={isEn ? "Empty = unlimited" : "Vide = illimité"} value={tierMax} onChange={(e) => setTierMax(e.target.value)} />
                <Input id="tierPercent" label={isEn ? "Commission (%)" : "Commission (%)"} helpText={isEn ? "e.g. 25 for 25%" : "ex. 25 pour 25 %"} value={tierPercent} onChange={(e) => setTierPercent(e.target.value)} required />
                <Button type="submit" loading={isSavingTier}>{isEn ? "Add tier" : "Ajouter"}</Button>
              </form>
            </Card>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-foreground">
              {isEn ? "Pending requests" : "Demandes en attente"}
            </h3>
            {requests.length === 0 ? (
              <EmptyState
                title={isEn ? "No pending requests" : "Aucune demande en attente"}
                description={
                  isEn
                    ? "Organizers ask to launch without paying the fee upfront."
                    : "Les organisateurs demandent à lancer sans payer le forfait immédiatement."
                }
              />
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <Card key={request.id} className="border border-border p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{request.eventTitle}</p>
                        <p className="text-sm text-muted-foreground">{request.tenantName}</p>
                        {request.estimatedRevenueCfa != null ? (
                          <p className="mt-1 text-sm">
                            {isEn ? "Expected revenue:" : "Recettes prévues :"}{" "}
                            <span className="font-medium">
                              {request.estimatedRevenueCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} FCFA
                            </span>
                          </p>
                        ) : null}
                        {request.reason ? (
                          <p className="mt-2 text-sm text-foreground">{request.reason}</p>
                        ) : null}
                      </div>
                      <StatusChip label={request.status} tone="pending" />
                    </div>
                    {tiers.length > 0 ? (
                      <div className="max-w-xs">
                        <label htmlFor={`tier-${request.id}`} className="mb-1 block text-sm font-medium">
                          {isEn ? "Commission on approval" : "Commission à l'approbation"}
                        </label>
                        <select
                          id={`tier-${request.id}`}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={approveTierByRequest[request.id] ?? request.offerTier?.id ?? ""}
                          onChange={(e) =>
                            setApproveTierByRequest((prev) => ({
                              ...prev,
                              [request.id]: e.target.value
                            }))
                          }
                        >
                          <option value="">{isEn ? "Auto from estimate" : "Auto selon estimation"}</option>
                          {tiers.map((tier) => (
                            <option key={tier.id} value={tier.id}>
                              {tier.label} ({(tier.platformShareBps / 100).toFixed(1)} %)
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" loading={busyId === request.id} onClick={() => void onApprove(request)}>
                        {isEn ? "Approve" : "Approuver"}
                      </Button>
                      <Button size="sm" variant="secondary" loading={busyId === request.id} onClick={() => void onReject(request.id)}>
                        {isEn ? "Reject" : "Refuser"}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="text-xl font-bold text-foreground">
                {isEn ? "Partner events · finances" : "Évènements partenaires · finances"}
              </h3>
            </div>
            {financials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isEn ? "No partner events yet." : "Aucun évènement partenaire pour l'instant."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-3 font-semibold">{isEn ? "Vote" : "Vote"}</th>
                      <th className="px-3 py-3 font-semibold">{isEn ? "Organizer" : "Organisateur"}</th>
                      <th className="px-3 py-3 font-semibold">{isEn ? "Vote total" : "Total votes"}</th>
                      <th className="px-3 py-3 font-semibold">{isEn ? "Commission" : "Commission"}</th>
                      <th className="px-3 py-3 font-semibold">{isEn ? "SHADOMA kept" : "Prélevé SHADOMA"}</th>
                      <th className="px-3 py-3 font-semibold">{isEn ? "Launch fee owed" : "Forfait dû"}</th>
                      <th className="px-3 py-3 font-semibold">{isEn ? "To pay out" : "À reverser"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financials.map((row) => (
                      <tr key={row.eventId} className="border-t border-border">
                        <td className="px-3 py-3">
                          <p className="font-medium">{row.eventTitle}</p>
                        </td>
                        <td className="px-3 py-3">{row.tenantName}</td>
                        <td className="px-3 py-3 font-medium">
                          {row.votesGrossCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")}
                        </td>
                        <td className="px-3 py-3">
                          {row.platformSharePercent.toFixed(1)} %
                          {row.offerTierLabel ? (
                            <span className="block text-xs text-muted-foreground">{row.offerTierLabel}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          {row.platformCommissionCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")}
                        </td>
                        <td className="px-3 py-3">
                          {row.activationRemainingCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")}
                        </td>
                        <td className="px-3 py-3 font-semibold text-emerald-700">
                          {row.organizerNetPayableCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <Card className="border border-primary/20 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <Handshake className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {isEn
                  ? "Partner events: SHADOMA collects voter payments. Commission applies on each vote according to the grid; if actual revenue exceeds the estimate, the rate is recalculated automatically. The launch fee is deducted before paying the organizer."
                  : "Évènements partenaires : SHADOMA encaisse les votes. La commission s'applique à chaque vote selon la grille ; si les recettes réelles dépassent l'estimation, le taux est recalculé automatiquement. Le forfait de lancement est déduit avant le reversement à l'organisateur."}
              </p>
            </div>
          </Card>
        </>
      )}
    </AdminPageShell>
  );
}
