"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { authedFetch, ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import {
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  StatusChip
} from "@/components/ui";
import { GlassCard } from "@/components/glass-card";

type WalletResponse = {
  id: string;
  tenantId: string;
  availableCfa: number;
  pendingCfa: number;
  updatedAt: string;
  recentEntries: Array<{
    id: string;
    kind: string;
    amountCfa: number;
    createdAt: string;
    note: string | null;
  }>;
};

type Withdrawal = {
  id: string;
  amountCfa: number;
  status: string;
  createdAt: string;
  rejectReason: string | null;
};

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function DashboardWalletPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const [w, list] = await Promise.all([
      authedFetch<WalletResponse>("/organizer/wallet"),
      authedFetch<Withdrawal[]>("/organizer/withdrawals")
    ]);
    setWallet(w);
    setWithdrawals(list);
  }, [router]);

  useEffect(() => {
    setIsLoading(true);
    setError("");
    void load()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [load]);

  const onWithdraw = async (event: FormEvent) => {
    event.preventDefault();
    const amountCfa = Number.parseInt(amount, 10);
    if (!Number.isInteger(amountCfa) || amountCfa <= 0) {
      showToast.error(isEn ? "Enter a valid amount." : "Saisissez un montant valide.");
      return;
    }
    setIsSubmitting(true);
    try {
      await authedFetch("/organizer/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountCfa })
      });
      showToast.success(isEn ? "Withdrawal requested." : "Retrait demandé.");
      setAmount("");
      await load();
    } catch (caught) {
      showToast.error(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : isEn
              ? "Request failed."
              : "Demande impossible."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={isEn ? "Loading wallet…" : "Chargement du portefeuille…"} />;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-border/50 pb-6">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">
          {isEn ? "Escrow" : "Escrow"}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {isEn ? "Wallet" : "Portefeuille"}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {isEn
            ? "Available balance from confirmed escrow payments. Request a withdrawal for admin approval."
            : "Solde disponible issu des paiements escrow confirmés. Demandez un retrait pour validation admin."}
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      {wallet ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <GlassCard intensity="subtle" className="p-6">
            <p className="text-sm text-muted-foreground">{isEn ? "Available" : "Disponible"}</p>
            <p className="mt-2 text-3xl font-extrabold">{formatCfa(wallet.availableCfa, isEn)}</p>
          </GlassCard>
          <GlassCard intensity="subtle" className="p-6">
            <p className="text-sm text-muted-foreground">{isEn ? "Pending (events not closed)" : "En attente (événements non clôturés)"}</p>
            <p className="mt-2 text-3xl font-extrabold">{formatCfa(wallet.pendingCfa, isEn)}</p>
          </GlassCard>
        </div>
      ) : !error ? (
        <EmptyState
          title={isEn ? "No wallet" : "Pas de portefeuille"}
          description={
            isEn
              ? "Wallet is available for the Escrow offer."
              : "Le portefeuille est disponible pour l'offre Escrow."
          }
        />
      ) : null}

      {wallet ? (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-bold">{isEn ? "Request withdrawal" : "Demander un retrait"}</h2>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onWithdraw}>
            <div className="flex-1">
              <Input
                id="amount"
                label={isEn ? "Amount (CFA)" : "Montant (FCFA)"}
                type="number"
                min={1}
                max={wallet.availableCfa}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={isSubmitting} disabled={wallet.availableCfa <= 0}>
              {isEn ? "Withdraw" : "Retirer"}
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-bold">{isEn ? "Withdrawal history" : "Historique des retraits"}</h2>
        {withdrawals.length === 0 ? (
          <EmptyState
            title={isEn ? "No withdrawals yet" : "Aucun retrait"}
            description={isEn ? "Your requests will appear here." : "Vos demandes apparaîtront ici."}
          />
        ) : (
          <ul className="space-y-3">
            {withdrawals.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="font-semibold">{formatCfa(w.amountCfa, isEn)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(w.createdAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
                  </p>
                  {w.rejectReason ? (
                    <p className="mt-1 text-xs text-destructive">{w.rejectReason}</p>
                  ) : null}
                </div>
                <StatusChip label={w.status} tone="muted" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {wallet && wallet.recentEntries.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">{isEn ? "Recent ledger" : "Journal récent"}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {wallet.recentEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{entry.kind}</p>
                  {entry.note ? <p className="text-xs text-muted-foreground">{entry.note}</p> : null}
                </div>
                <p className="font-semibold">{formatCfa(entry.amountCfa, isEn)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
