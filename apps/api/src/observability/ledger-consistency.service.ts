import { Injectable } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type LedgerInconsistency = {
  voteId: string;
  paymentId: string | null;
  reason: string;
};

export type LedgerReport = {
  votesPaidWithoutSucceededPayment: LedgerInconsistency[];
  succeededPaymentsWithoutPaidVote: LedgerInconsistency[];
};

/**
 * Detects ledger ↔ vote drift. Used by the payouts reconciliation job (Phase 3)
 * and surfaced on demand to platform admins. Cheap enough to run inline (two
 * indexed scans), but kept stateless: it reports, it does not mutate.
 */
@Injectable()
export class LedgerConsistencyService {
  constructor(private readonly prisma: PrismaService) {}

  async scan(): Promise<LedgerReport> {
    // Votes with paidAt set but no SUCCEEDED VOTE payment behind them.
    const paidVotes = await this.prisma.client.vote.findMany({
      where: { paidAt: { not: null }, cancelledAt: null },
      select: { id: true }
    });
    const paidPayments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        purpose: PaymentPurpose.VOTE,
        status: PaymentStatus.SUCCEEDED,
        voteId: { not: null }
      },
      select: { id: true, voteId: true }
    });
    const paidPaymentVoteIds = new Set(
      paidPayments.map((p) => p.voteId).filter((v): v is string => v !== null)
    );
    const votesPaidWithoutSucceededPayment = paidVotes
      .filter((v) => !paidPaymentVoteIds.has(v.id))
      .map<LedgerInconsistency>((v) => ({
        voteId: v.id,
        paymentId: null,
        reason: "Vote.paidAt set but no SUCCEEDED VOTE PaymentTransaction"
      }));

    // SUCCEEDED VOTE payments whose Vote has no paidAt (or is cancelled).
    const paidVoteIds = new Set(paidVotes.map((v) => v.id));
    const succeededPaymentsWithoutPaidVote = paidPayments
      .filter((p) => p.voteId !== null && !paidVoteIds.has(p.voteId))
      .map<LedgerInconsistency>((p) => ({
        voteId: p.voteId as string,
        paymentId: p.id,
        reason: "SUCCEEDED VOTE PaymentTransaction but Vote.paidAt missing or vote cancelled"
      }));

    return { votesPaidWithoutSucceededPayment, succeededPaymentsWithoutPaidVote };
  }
}
