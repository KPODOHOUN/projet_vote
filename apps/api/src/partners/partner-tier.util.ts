import { PaymentPurpose, PaymentStatus, type PrismaClient } from "@prisma/client";

export async function resolveTierForRevenue(prisma: PrismaClient, revenueCfa: number) {
  const tiers = await prisma.partnerOfferTier.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" }
  });
  for (const tier of tiers) {
    const inMin = revenueCfa >= tier.minRevenueCfa;
    const inMax = tier.maxRevenueCfa == null || revenueCfa <= tier.maxRevenueCfa;
    if (inMin && inMax) return tier;
  }
  return null;
}

/** Commission partenaire basée sur les recettes cumulées (anti-sous-estimation). */
export async function resolvePartnerVoteCommissionBps(
  prisma: PrismaClient,
  eventId: string,
  fallbackBps: number,
  pendingAmountCfa: number
): Promise<number> {
  const agg = await prisma.paymentTransaction.aggregate({
    where: {
      eventId,
      purpose: PaymentPurpose.VOTE,
      status: PaymentStatus.SUCCEEDED
    },
    _sum: { amountCfa: true }
  });
  const cumulativeGross = (agg._sum.amountCfa ?? 0) + pendingAmountCfa;
  const tier = await resolveTierForRevenue(prisma, cumulativeGross);
  return tier?.platformShareBps ?? fallbackBps;
}
