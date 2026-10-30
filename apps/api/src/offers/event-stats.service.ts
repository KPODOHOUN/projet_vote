import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus, TicketStatus, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

export type EventOfferStats = {
  eventId: string;
  title: string;
  status: string;
  closedAt: Date | null;
  /** Montant brut encaissé par les votes (votes du public + votes ajoutés par l'organisateur). */
  votesGrossCfa: number;
  /** Montant brut encaissé par les billets. */
  ticketsGrossCfa: number;
  /** Total encaissé = votes + billets. */
  totalCollectedCfa: number;
  /** Nombre de voix payées (même source que les résultats publics). */
  votesCount: number;
  publicVotesCount: number;
  topupVotesCount: number;
  ticketsSoldCount: number;
  /** Commission enregistrée sur chaque paiement à sa confirmation (jamais recalculée). */
  platformCommissionCfa: number;
  organizerNetCfa: number;
  /** Réserve encore détenue pour CE concours (allocations − libérations). */
  eventHeldCfa: number;
  /**
   * Somme versée par ce concours au solde retirable (crédits disponibles +
   * réserve libérée). Contribution cumulée : les retraits puisent dans le
   * solde global du portefeuille.
   */
  eventWithdrawableContributedCfa: number;
};

const MONEY_PURPOSES = [PaymentPurpose.VOTE, PaymentPurpose.TICKET, PaymentPurpose.ORGANIZER_VOTE_TOPUP];

@Injectable()
export class EventStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService
  ) {}

  async getEventStats(eventId: string, tenantId?: string): Promise<EventOfferStats> {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, title: true, status: true, closedAt: true, tenantId: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");

    const [byPurpose, paidVotes, topupVotes, ticketsSoldCount, wallet] = await Promise.all([
      this.prisma.client.paymentTransaction.groupBy({
        by: ["purpose"],
        where: { eventId: event.id, status: PaymentStatus.SUCCEEDED, purpose: { in: MONEY_PURPOSES } },
        _sum: { amountCfa: true, commissionCfa: true }
      }),
      this.prisma.client.vote.aggregate({
        where: { eventId: event.id, paidAt: { not: null }, cancelledAt: null },
        _sum: { votesCount: true }
      }),
      this.prisma.client.paymentTransaction.aggregate({
        where: { eventId: event.id, status: PaymentStatus.SUCCEEDED, purpose: PaymentPurpose.ORGANIZER_VOTE_TOPUP },
        _sum: { votesCount: true }
      }),
      this.prisma.client.ticket.count({
        where: { eventId: event.id, status: { in: [TicketStatus.PAID, TicketStatus.CONFIRMED, TicketStatus.USED] } }
      }),
      this.wallet.getOrCreateWallet(event.tenantId)
    ]);

    const gross = (purpose: PaymentPurpose) => byPurpose.find((r) => r.purpose === purpose)?._sum.amountCfa ?? 0;
    const votesGrossCfa = gross(PaymentPurpose.VOTE) + gross(PaymentPurpose.ORGANIZER_VOTE_TOPUP);
    const ticketsGrossCfa = gross(PaymentPurpose.TICKET);
    const totalCollectedCfa = votesGrossCfa + ticketsGrossCfa;
    const platformCommissionCfa = byPurpose.reduce((sum, r) => sum + (r._sum.commissionCfa ?? 0), 0);
    const votesCount = paidVotes._sum.votesCount ?? 0;
    const topupVotesCount = topupVotes._sum.votesCount ?? 0;

    const ledger = await this.prisma.client.walletLedgerEntry.groupBy({
      by: ["kind"],
      where: { walletId: wallet.id, eventId: event.id },
      _sum: { amountCfa: true }
    });
    const sumOf = (kind: WalletLedgerKind) => ledger.find((g) => g.kind === kind)?._sum.amountCfa ?? 0;
    const released = sumOf(WalletLedgerKind.HELD_RELEASE);

    return {
      eventId: event.id,
      title: event.title,
      status: event.status,
      closedAt: event.closedAt,
      votesGrossCfa,
      ticketsGrossCfa,
      totalCollectedCfa,
      votesCount,
      publicVotesCount: Math.max(0, votesCount - topupVotesCount),
      topupVotesCount,
      ticketsSoldCount,
      platformCommissionCfa,
      organizerNetCfa: Math.max(0, totalCollectedCfa - platformCommissionCfa),
      eventHeldCfa: Math.max(0, sumOf(WalletLedgerKind.HELD_ALLOCATION) - released),
      eventWithdrawableContributedCfa:
        sumOf(WalletLedgerKind.VOTE_CREDIT) +
        sumOf(WalletLedgerKind.TICKET_CREDIT) +
        sumOf(WalletLedgerKind.TOPUP_CREDIT) +
        released
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
        tenant: { select: { id: true, slug: true, displayName: true } }
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
