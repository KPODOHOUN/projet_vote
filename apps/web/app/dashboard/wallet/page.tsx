"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authLoginUrl } from "@/lib/auth-navigation";
import { ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { formatCfa } from "@/lib/format";
import {
  usePayoutDestinationQuery,
  useWalletQuery,
  useWithdrawalsQuery,
  useWithdrawalMutation
} from "@/lib/hooks/use-wallet";
import { mobileNetworkLabel } from "@/lib/mobile-networks";
import type { MessageKey } from "@/lib/i18n";
import { Button, FormError, Input, LoadingState, StatusChip } from "@/components/ui";

const WITHDRAWAL_STATUSES = new Set(["PENDING", "APPROVED", "PAID", "REJECTED"]);

/**
 * Portefeuille (7.7) : disponible en grand à gauche, réserve et commission à
 * droite (60/40, pas de cartes jumelles), retrait en bloc séparé. Tous les
 * montants viennent de l'API ; rien n'est calculé dans le navigateur.
 */
export default function DashboardWalletPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) {
      router.push(authLoginUrl());
    }
  }, [hasToken, router]);

  const walletQuery = useWalletQuery(hasToken);
  const withdrawalsQuery = useWithdrawalsQuery(hasToken);
  const withdrawalMutation = useWithdrawalMutation();
  const destinationQuery = usePayoutDestinationQuery(hasToken);
  const destination = destinationQuery.data ?? null;

  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");

  const wallet = walletQuery.data;
  const withdrawals = withdrawalsQuery.data ?? [];
  const cfa = (value: number) => formatCfa(value, locale);

  const onWithdraw = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    const amountCfa = Number.parseInt(amount, 10);
    if (!Number.isInteger(amountCfa) || amountCfa <= 0) {
      setFormError(t("dash.wallet.invalidAmount"));
      return;
    }
    try {
      await withdrawalMutation.mutateAsync(amountCfa);
      showToast.success(t("dash.wallet.requestedSuccess"));
      setAmount("");
    } catch (caught) {
      setFormError(
        caught instanceof ApiError || caught instanceof Error ? caught.message : t("dash.wallet.requestFailed")
      );
    }
  };

  if (walletQuery.isPending || withdrawalsQuery.isPending) {
    return <LoadingState variant="rows" count={4} label={t("dash.wallet.loading")} />;
  }

  if (walletQuery.isError || !wallet) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("wallet.title")}</h1>
        <FormError>{walletQuery.error instanceof Error ? walletQuery.error.message : t("dash.wallet.requestFailed")}</FormError>
        <Button variant="secondary" onClick={() => void walletQuery.refetch()}>
          {t("pay.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t("wallet.title")}</h1>
        <p className="max-w-2xl text-slate-600">{t("wallet.lead")}</p>
      </header>

      <section className="grid gap-6 border-b border-border pb-8 md:grid-cols-[3fr_2fr]">
        <div>
          <p className="text-sm text-slate-600">{t("wallet.available")}</p>
          <p className="mt-1 text-4xl font-extrabold text-slate-900 tabular-nums">{cfa(wallet.withdrawableCfa)}</p>
        </div>
        <dl className="space-y-3 text-sm md:border-l md:border-border md:pl-6">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-slate-600">{t("wallet.held")}</dt>
            <dd className="font-bold text-slate-900 tabular-nums">{cfa(wallet.heldCfa)}</dd>
          </div>
          {typeof wallet.commissionCfa === "number" ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-600">{t("wallet.commission")}</dt>
              <dd className="font-bold text-slate-900 tabular-nums">{cfa(wallet.commissionCfa)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="by-event-title" className="space-y-3">
        <h2 id="by-event-title" className="text-lg font-bold text-slate-900">{t("wallet.byEvent")}</h2>
        {!wallet.byEvent ? (
          <p className="text-sm text-slate-600">{t("wallet.byEventUnavailable")}</p>
        ) : wallet.byEvent.length === 0 ? (
          <p className="text-sm text-slate-600">{t("dash.overview.noEventsTitle")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-slate-600">
                  <th className="py-2 pr-3 font-semibold">{t("wallet.col.event")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("wallet.col.gross")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("wallet.col.commission")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("wallet.col.held")}</th>
                  <th className="py-2 text-right font-semibold">{t("wallet.col.available")}</th>
                </tr>
              </thead>
              <tbody>
                {wallet.byEvent.map((row) => (
                  <tr key={row.eventId} className="border-b border-border">
                    <td className="py-2 pr-3 font-medium text-slate-900">{row.title}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{cfa(row.grossCfa)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{cfa(row.commissionCfa)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{cfa(row.heldCfa)}</td>
                    <td className="py-2 text-right tabular-nums">{cfa(row.creditedAvailableCfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="request-title" className="space-y-4 rounded-md border border-border p-5">
        <h2 id="request-title" className="text-lg font-bold text-slate-900">{t("wallet.request.title")}</h2>
        <p className="text-sm text-slate-600">
          {t("wallet.request.number")} :{" "}
          {destination ? (
            <span className="font-semibold text-slate-900">
              {t("payoutDest.current", { network: mobileNetworkLabel(destination.network), last4: destination.last4 })}
            </span>
          ) : destinationQuery.isLoading ? null : (
            <span className="font-semibold text-slate-900">{t("payoutDest.missingForWithdrawal")}</span>
          )}{" "}
          <Link href="/dashboard/account#payout-destination" className="font-semibold text-primary underline underline-offset-4">
            {t("wallet.request.edit")}
          </Link>
        </p>
        <form className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onWithdraw} noValidate>
          <div className="flex-1">
            <Input
              id="amount"
              label={t("dash.wallet.amountLabel")}
              type="number"
              inputMode="numeric"
              min={1}
              max={wallet.withdrawableCfa}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="h-12"
            loading={withdrawalMutation.isPending}
            disabled={wallet.withdrawableCfa <= 0 || !destination}
          >
            {t("wallet.request.submit")}
          </Button>
        </form>
        <p className="text-sm text-slate-600">{t("wallet.request.help")}</p>
        <FormError>{formError}</FormError>
      </section>

      <section aria-labelledby="requests-title" className="space-y-3">
        <h2 id="requests-title" className="text-lg font-bold text-slate-900">{t("wallet.requests")}</h2>
        {withdrawals.length === 0 ? (
          <p className="text-sm text-slate-600">{t("wallet.noRequests")}</p>
        ) : (
          <ul className="border-t border-border">
            {withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3">
                <div>
                  <p className="font-semibold text-slate-900 tabular-nums">{cfa(w.amountCfa)}</p>
                  <p className="text-xs text-slate-600">
                    {new Date(w.createdAt).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")}
                  </p>
                  {w.rejectReason ? <p className="mt-1 text-xs text-[var(--color-error-text)]">{w.rejectReason}</p> : null}
                </div>
                <StatusChip
                  label={WITHDRAWAL_STATUSES.has(w.status) ? t(`withdrawal.status.${w.status}` as MessageKey) : w.status}
                  tone={w.status === "PAID" ? "success" : w.status === "REJECTED" ? "error" : w.status === "PENDING" ? "pending" : "live"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
