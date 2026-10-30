"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { formatEventDate } from "@/lib/format";
import { useOrganizerOffer } from "@/lib/hooks/use-organizer-offer";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FormError, LoadingState } from "@/components/ui";

function formatRate(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2)} %`;
}

/** Conditions financières de l'organisateur : mêmes règles que celles du contrat et des calculs de l'API. */
export default function OrganizerOfferPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [hasToken] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!hasToken) router.push(authLoginUrl());
  }, [hasToken, router]);

  const offerQuery = useOrganizerOffer(hasToken);
  const offer = offerQuery.data;

  if (offerQuery.isPending) return <LoadingState label={t("offer.loading")} />;
  if (offerQuery.isError || !offer) {
    return <FormError>{offerQuery.error instanceof Error && offerQuery.error.message ? offerQuery.error.message : t("offer.loadError")}</FormError>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="block text-sm font-semibold text-slate-600">{t("offer.kicker")}</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("offer.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("offer.intro")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{t("offer.commissionLabel")}</CardDescription>
          <CardTitle className="text-3xl font-black tracking-tight">{formatRate(offer.commissionBps)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{offer.commissionSource === "tenant" ? t("offer.commissionNegotiated") : t("offer.commissionDefault")}</p>
          {offer.upcomingCommission ? (
            <p className="font-medium text-foreground">
              {t("offer.upcoming", {
                rate: formatRate(offer.upcomingCommission.bps),
                date: formatEventDate(offer.upcomingCommission.effectiveFrom, locale)
              })}
            </p>
          ) : null}
          <p>{t("offer.feesNote")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>{t("offer.reserveLabel")}</CardDescription>
          <CardTitle className="text-2xl font-black tracking-tight">{formatRate(offer.heldBps)}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("offer.reserveDesc", { rate: formatRate(offer.heldBps), hours: offer.heldReleaseDelayHours })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>{t("offer.payoutLabel")}</CardDescription>
          <CardTitle className="text-lg font-bold">
            {offer.payoutConfigured && offer.payoutNetwork && offer.payoutPhoneLast4
              ? t("offer.payoutSet", { network: offer.payoutNetwork, last4: offer.payoutPhoneLast4 })
              : t("offer.payoutMissing")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/wallet">{t("offer.openWallet")}</Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t("offer.otherRate")}</p>
    </div>
  );
}
