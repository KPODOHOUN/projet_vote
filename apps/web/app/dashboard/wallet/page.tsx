"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import {
  useWalletQuery,
  useWithdrawalsQuery,
  useWithdrawalMutation
} from "@/lib/hooks/use-wallet";
import {
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  StatusChip
} from "@/components/ui";

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function DashboardWalletPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) {
      router.push(authLoginUrl());
    }
  }, [hasToken, router]);

  const walletQuery = useWalletQuery(hasToken);
  const withdrawalsQuery = useWithdrawalsQuery(hasToken);
  const withdrawalMutation = useWithdrawalMutation();

  const [amount, setAmount] = useState("");

  const isLoading = walletQuery.isPending || withdrawalsQuery.isPending;
  const isError = walletQuery.isError || withdrawalsQuery.isError;
  const wallet = walletQuery.data;
  const withdrawals = withdrawalsQuery.data ?? [];

  const onWithdraw = async (event: FormEvent) => {
    event.preventDefault();
    const amountCfa = Number.parseInt(amount, 10);
    if (!Number.isInteger(amountCfa) || amountCfa <= 0) {
      showToast.error(t("dash.wallet.invalidAmount"));
      return;
    }
    try {
      await withdrawalMutation.mutateAsync(amountCfa);
      showToast.success(t("dash.wallet.requestedSuccess"));
      setAmount("");
    } catch (caught) {
      showToast.error(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : t("dash.wallet.requestFailed")
      );
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={4} label={t("dash.wallet.loading")} />;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-border/50 pb-6">
        <span className="text-sm font-bold uppercase tracking-widest text-primary">
          {t("dash.wallet.kicker")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {t("dash.wallet.title")}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {t("dash.wallet.subtitle")}
        </p>
      </header>

      {isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive" role="alert">
          {walletQuery.error instanceof Error ? walletQuery.error.message : t("dash.wallet.requestFailed")}
        </div>
      ) : null}

      {wallet ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">{t("dash.wallet.available")}</p>
            <p className="mt-2 text-3xl font-extrabold">{formatCfa(wallet.availableCfa, isEn)}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">{t("dash.wallet.pending")}</p>
            <p className="mt-2 text-3xl font-extrabold">{formatCfa(wallet.pendingCfa, isEn)}</p>
          </Card>
        </div>
      ) : !isError ? (
        <EmptyState
          title={t("dash.wallet.noWalletTitle")}
          description={t("dash.wallet.noWalletDesc")}
        />
      ) : null}

      {wallet ? (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-bold">{t("dash.wallet.requestTitle")}</h2>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onWithdraw}>
            <div className="flex-1">
              <Input
                id="amount"
                label={t("dash.wallet.amountLabel")}
                type="number"
                min={1}
                max={wallet.availableCfa}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={withdrawalMutation.isPending} disabled={wallet.availableCfa <= 0}>
              {t("dash.wallet.withdrawButton")}
            </Button>
          </form>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-bold">{t("dash.wallet.historyTitle")}</h2>
        {withdrawals.length === 0 ? (
          <EmptyState
            title={t("dash.wallet.noWithdrawalsTitle")}
            description={t("dash.wallet.noWithdrawalsDesc")}
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
          <h2 className="text-lg font-bold">{t("dash.wallet.ledgerTitle")}</h2>
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
