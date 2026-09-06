"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { useOrganizerOffer } from "@/lib/hooks/use-organizer-offer";
import { useSubscriptionUsage } from "@/lib/hooks/use-subscription";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
  LoadingState,
} from "@/components/ui";

function formatCommissionRate(bps: number | undefined): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

export default function OrganizerOfferPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) router.push(authLoginUrl());
  }, [hasToken, router]);

  const offerQuery = useOrganizerOffer(hasToken);
  const usageQuery = useSubscriptionUsage(hasToken);
  const offer = offerQuery.data;
  const usage = usageQuery.data;

  if (offerQuery.isPending) {
    return <LoadingState label={t("offer.loading")} />;
  }

  const offerError =
    offerQuery.isError
      ? offerQuery.error instanceof Error && offerQuery.error.message
        ? offerQuery.error.message
        : t("offer.loadError")
      : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{t("offer.kicker")}</p>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("offer.title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("offer.activeLabel", { type: offer?.offerType ?? t("offer.unavailable") })}
        </p>
      </div>

      <FormError>{offerError}</FormError>

      {offer?.offerType === "EXTERNAL" ? (
        <Card className="border-[var(--color-warning)]/30 bg-amber-500/5">
          <CardHeader>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              {t("offer.externalKicker")}
            </p>
            <CardTitle className="text-xl font-bold">{t("offer.externalTitle")}</CardTitle>
            <CardDescription>{t("offer.externalDesc")}</CardDescription>
          </CardHeader>
          {offer.fedapaySubAccount.reference ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("offer.fedapayRef")} <code>{offer.fedapaySubAccount.reference}</code>
              </p>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {t("offer.escrowKicker")}
            </p>
            <CardTitle className="text-xl font-bold">{t("offer.escrowTitle")}</CardTitle>
            <CardDescription>{t("offer.escrowDesc")}</CardDescription>
          </CardHeader>
          {offer?.offerType === "ESCROW" ? (
            <CardContent>
              <Button asChild>
                <Link href="/dashboard/wallet">{t("offer.openWallet")}</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      )}

      {usage?.hasSubscription ? (
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("offer.planActiveTitle")}
            </p>
            <CardTitle className="text-2xl font-black tracking-tight">
              {usage.planName ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {usage.daysRemaining != null ? (
              <span>{t("offer.expiresIn", { days: usage.daysRemaining })}</span>
            ) : null}
            {usage.commissionRate != null ? (
              <span>{t("offer.commission", { rate: formatCommissionRate(usage.commissionRate) })}</span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
