"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import {
  listPayouts,
  openPayoutPeriod,
  processPayoutPeriod,
  resolveUncertainPayout,
  PAYOUT_STATUS_TONE,
  type Payout,
  type PayoutStatus
} from "@/lib/platform-payouts";
import { showToast } from "@/lib/toast";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingState,
  StatusChip
} from "@/components/ui";
import {
  AdminDataTable,
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminSection,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh
} from "@/components/admin/admin-shell";

const STATUS_FILTERS: Array<{ value: "" | PayoutStatus; labelFr: string; labelEn: string }> = [
  { value: "", labelFr: "Tous", labelEn: "All" },
  { value: "PENDING", labelFr: "En attente", labelEn: "Pending" },
  { value: "IN_FLIGHT", labelFr: "En cours", labelEn: "In flight" },
  { value: "SUCCEEDED", labelFr: "Réussis", labelEn: "Succeeded" },
  { value: "FAILED", labelFr: "Échoués", labelEn: "Failed" },
  { value: "UNCERTAIN", labelFr: "Incertains", labelEn: "Uncertain" }
];

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | PayoutStatus>("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [lastPeriodId, setLastPeriodId] = useState<string | null>(null);
  const [processId, setProcessId] = useState("");

  const [resolveRef, setResolveRef] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const response = await listPayouts(token, {
      ...(statusFilter ? { status: statusFilter } : {}),
      limit: 100
    });
    setPayouts(response);
  }, [router, statusFilter]);

  useEffect(() => {
    setError("");
    setIsLoading(true);
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [load]);

  const onOpenPeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setIsCreating(true);
    try {
      const period = await openPayoutPeriod(token, {
        label: label.trim(),
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString()
      });
      setLastPeriodId(period.id);
      setProcessId(period.id);
      showToast.success(isEn ? `Period ${period.label} opened.` : `Période ${period.label} ouverte.`);
      setLabel("");
      setFrom("");
      setTo("");
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Open failed." : "Ouverture impossible.");
    } finally {
      setIsCreating(false);
    }
  };

  const onProcess = async () => {
    const token = getStoredToken();
    if (!token || !processId.trim()) return;
    setBusyId("process");
    try {
      const result = await processPayoutPeriod(token, processId.trim());
      showToast.success(
        isEn
          ? `Processed: ${result.payouts.length} payout(s).`
          : `Traité : ${result.payouts.length} versement(s).`
      );
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Process failed." : "Traitement impossible.");
    } finally {
      setBusyId(null);
    }
  };

  const onResolve = async (payoutId: string, resolution: "SUCCEEDED" | "FAILED") => {
    const token = getStoredToken();
    if (!token) return;
    const ref = resolveRef[payoutId]?.trim();
    if (resolution === "SUCCEEDED" && !ref) {
      showToast.error(isEn ? "Provider reference required." : "Référence PSP requise.");
      return;
    }
    setBusyId(payoutId);
    try {
      await resolveUncertainPayout(
        token,
        payoutId,
        resolution === "SUCCEEDED"
          ? { resolution, providerRef: ref as string }
          : { resolution, reason: ref || "Résolu FAILED par admin" }
      );
      showToast.success(isEn ? "Payout resolved." : "Versement résolu.");
      await load();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Resolve failed." : "Résolution impossible.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "God-mode" : "God-mode"}
        title={isEn ? "Platform payouts" : "Versements plateforme"}
        description={
          isEn
            ? "Open a billing period, process disbursements, and resolve uncertain payouts. Every action is platform-admin only."
            : "Ouvrez une période de facturation, lancez les versements et résolvez les versements incertains. Réservé aux admins plateforme."
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 border-border p-6">
          <h2 className="text-lg font-bold">{isEn ? "Open a period" : "Ouvrir une période"}</h2>
          <form className="space-y-4" onSubmit={onOpenPeriod}>
            <Input
              id="label"
              label={isEn ? "Label" : "Libellé"}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="2026-07"
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="from" label={isEn ? "From" : "Du"} type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
              <Input id="to" label={isEn ? "To" : "Au"} type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <Button type="submit" loading={isCreating}>
              {isEn ? "Open period" : "Ouvrir la période"}
            </Button>
            {lastPeriodId ? (
              <p className="font-mono text-xs text-muted-foreground">ID: {lastPeriodId}</p>
            ) : null}
          </form>
        </Card>

        <Card className="space-y-4 border-border p-6">
          <h2 className="text-lg font-bold">{isEn ? "Process a period" : "Traiter une période"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "Runs disbursements for the given period ID. Idempotent and safe to re-run."
              : "Lance les versements pour l'ID de période donné. Idempotent, ré-exécutable sans risque."}
          </p>
          <Input
            id="processId"
            label={isEn ? "Period ID" : "ID de période"}
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
            placeholder="cuid…"
          />
          <ConfirmDialog
            disabled={!processId.trim() || busyId === "process"}
            title={isEn ? "Process payouts?" : "Lancer les versements ?"}
            description={
              isEn
                ? "This triggers real disbursements through the PSP for every organizer with a balance."
                : "Ceci déclenche de vrais versements via le PSP pour chaque organisateur ayant un solde."
            }
            confirmLabel={isEn ? "Process" : "Traiter"}
            cancelLabel={isEn ? "Cancel" : "Annuler"}
            onConfirm={() => void onProcess()}
            trigger={
              <Button type="button" variant="destructive" disabled={!processId.trim()} loading={busyId === "process"}>
                {isEn ? "Process disbursements" : "Lancer les versements"}
              </Button>
            }
          />
        </Card>
      </section>

      <AdminSection
        title={isEn ? "Payouts" : "Versements"}
        actions={
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value || "all"}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === filter.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {isEn ? filter.labelEn : filter.labelFr}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <LoadingState variant="rows" count={4} label={isEn ? "Loading payouts…" : "Chargement des versements…"} />
        ) : payouts.length === 0 ? (
          <EmptyState
            title={isEn ? "No payouts" : "Aucun versement"}
            description={isEn ? "No payout matches this status." : "Aucun versement pour ce statut."}
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>{isEn ? "Beneficiary" : "Bénéficiaire"}</AdminTh>
                <AdminTh>{isEn ? "Amount" : "Montant"}</AdminTh>
                <AdminTh>{isEn ? "Status" : "Statut"}</AdminTh>
                <AdminTh>{isEn ? "Resolve (uncertain)" : "Résoudre (incertain)"}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {payouts.map((payout) => (
                <AdminTableRow key={payout.id} className="align-top">
                  <AdminTd>
                      <p className="font-medium text-foreground">
                        {payout.kind === "PLATFORM" ? (isEn ? "Platform" : "Plateforme") : payout.beneficiaryTenantId?.slice(0, 12) + "…"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payout.provider} · {new Date(payout.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                      </p>
                      {payout.errorMessage ? (
                        <p className="mt-1 max-w-xs text-xs text-destructive">{payout.errorMessage}</p>
                      ) : null}
                    </AdminTd>
                    <AdminTd className="font-medium">{formatCfa(payout.amountCfa, isEn)}</AdminTd>
                    <AdminTd>
                      <StatusChip label={payout.status} tone={PAYOUT_STATUS_TONE[payout.status]} />
                    </AdminTd>
                    <AdminTd>
                      {payout.status === "UNCERTAIN" ? (
                        <div className="space-y-2">
                          <Input
                            id={`ref-${payout.id}`}
                            label={isEn ? "Provider ref / reason" : "Réf PSP / motif"}
                            value={resolveRef[payout.id] ?? ""}
                            onChange={(e) => setResolveRef((prev) => ({ ...prev, [payout.id]: e.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={busyId === payout.id}
                              onClick={() => void onResolve(payout.id, "SUCCEEDED")}
                            >
                              {isEn ? "Mark succeeded" : "Marquer réussi"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              loading={busyId === payout.id}
                              onClick={() => void onResolve(payout.id, "FAILED")}
                            >
                              {isEn ? "Mark failed" : "Marquer échoué"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </AdminTd>
                  </AdminTableRow>
                ))}
              </tbody>
          </AdminDataTable>
        )}
      </AdminSection>
    </AdminPageShell>
  );
}
