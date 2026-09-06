import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus, TenantOfferType, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

export type EventOfferStats = {
  eventId: string;
  title: string;
  status: string;
  offerType: TenantOfferType;
  closedAt: Date | null;
  totalCollectedCfa: number;
  votesCount: number;
  publicVotesCount: number;
  topupVotesCount: number;
  platformCommissionCfa: number;
  organizerNetCfa: number;
  /**
   * Réserve encore détenue pour CET event précisément (HELD_ALLOCATION − HELD_RELEASE
   * de ses propres entrées de ledger) — exact, car ces deux écritures sont toujours
   * rattachées à un eventId.
   */
  eventHeldCfa: number | null;
  /**
   * Montant total versé par CET event au solde retirable au fil de sa vie
   * (VOTE_CREDIT + TOPUP_CREDIT + HELD_RELEASE de ses entrées). C'est une
   * contribution cumulée, PAS un solde isolé : les retraits ne sont pas
   * rattachés à un event et puisent dans le pool global du portefeuille.
   */
  eventWithdrawableContributedCfa: number | null;
};

@Injectable()
export class EventStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService
  ) {}

  async getEventStats(eventId: string, tenantId?: string): Promise<EventOfferStats> {
    const event = await this.prisma.client.event.findFirst({
      where: {
        id: eventId,
        ...(tenantId ? { tenantId } : {})
      },
      select: {
        id: true,
        title: true,
        status: true,
        closedAt: true,
        tenantId: true,
        tenant: { select: { offerType: true } }
      }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    const payments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        eventId,
        status: PaymentStatus.SUCCEEDED,
        purpose: { in: [PaymentPurpose.VOTE, PaymentPurpose.ORGANIZER_VOTE_TOPUP] }
      },
      select: {
        purpose: true,
        amountCfa: true,
        commissionCfa: true,
        votesCount: true
      }
    });

    let totalCollectedCfa = 0;
    let votesCount = 0;
    let publicVotesCount = 0;
    let topupVotesCount = 0;
    let platformCommissionCfa = 0;

    for (const p of payments) {
      totalCollectedCfa += p.amountCfa;
      platformCommissionCfa += p.commissionCfa ?? 0;
      votesCount += p.votesCount;
      if (p.purpose === PaymentPurpose.ORGANIZER_VOTE_TOPUP) {
        topupVotesCount += p.votesCount;
      } else {
        publicVotesCount += p.votesCount;
      }
    }

    const organizerNetCfa = Math.max(0, totalCollectedCfa - platformCommissionCfa);

    let eventHeldCfa: number | null = null;
    let eventWithdrawableContributedCfa: number | null = null;
    if (event.tenant.offerType === TenantOfferType.ESCROW) {
      const wallet = await this.wallet.getOrCreateWallet(event.tenantId);
      const grouped = await this.prisma.client.walletLedgerEntry.groupBy({
        by: ["kind"],
        where: { walletId: wallet.id, eventId: event.id },
        _sum: { amountCfa: true }
      });
      const sumOf = (kind: WalletLedgerKind) =>
        grouped.find((g) => g.kind === kind)?._sum.amountCfa ?? 0;

      const allocated = sumOf(WalletLedgerKind.HELD_ALLOCATION);
      const released = sumOf(WalletLedgerKind.HELD_RELEASE);
      eventHeldCfa = Math.max(0, allocated - released);
      eventWithdrawableContributedCfa =
        sumOf(WalletLedgerKind.VOTE_CREDIT) + sumOf(WalletLedgerKind.TOPUP_CREDIT) + released;
    }

    return {
      eventId: event.id,
      title: event.title,
      status: event.status,
      offerType: event.tenant.offerType,
      closedAt: event.closedAt,
      totalCollectedCfa,
      votesCount,
      publicVotesCount,
      topupVotesCount,
      platformCommissionCfa,
      organizerNetCfa,
      eventHeldCfa,
      eventWithdrawableContributedCfa
    };
  }

  async listActiveEventsWithStats() {
    const events = await this.prisma.client.event.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        startsAt: true,
        endsAt: true,
        closedAt: true,
        tenantId: true,
        tenant: { select: { id: true, slug: true, displayName: true, offerType: true } }
      }
    });

    const stats = await Promise.all(events.map((e) => this.getEventStats(e.id)));
    const byId = new Map(stats.map((s) => [s.eventId, s]));

    return events.map((e) => ({
      ...e,
      stats: byId.get(e.id)!
    }));
  }
}
