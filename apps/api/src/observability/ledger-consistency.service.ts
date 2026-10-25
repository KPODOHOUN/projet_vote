import { Injectable } from "@nestjs/common";
import {
  LedgerBucket,
  LedgerDirection,
  PaymentPurpose,
  PaymentStatus,
  WalletLedgerKind
} from "@prisma/client";
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

export type WalletBalanceCheck = {
  walletId: string;
  tenantId: string;
  storedHeldCfa: number;
  storedWithdrawableCfa: number;
  ledgerHeldCfa: number;
  ledgerWithdrawableCfa: number;
  /** Lignes sans direction ou sans compartiment (antérieures à ADR-021, indécidables). */
  unknownEntries: number;
  /** ok : soldes = journal ; drift : écart ; unverifiable : lignes inconnues, comparaison impossible. */
  status: "ok" | "drift" | "unverifiable";
};

export type WalletReconciliation = {
  wallets: WalletBalanceCheck[];
  driftCount: number;
  unknownEntries: number;
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

  /**
   * ADR-021 : recalcule réserve et disponible depuis le journal signé et les
   * compare aux soldes stockés. HELD_RELEASE est un transfert (CREDIT
   * WITHDRAWABLE + débit implicite de HELD). Une ligne sans sens n'est jamais
   * additionnée : le wallet devient « unverifiable ».
   */
  async reconcileWallets(): Promise<WalletReconciliation> {
    const wallets = await this.prisma.client.organizerWallet.findMany({
      select: { id: true, tenantId: true, heldCfa: true, withdrawableCfa: true }
    });
    const groups = await this.prisma.client.walletLedgerEntry.groupBy({
      by: ["walletId", "kind", "direction", "bucket"],
      _sum: { amountCfa: true },
      _count: { _all: true }
    });

    const totals = new Map<string, { held: number; withdrawable: number; unknown: number }>();
    for (const g of groups) {
      const t = totals.get(g.walletId) ?? { held: 0, withdrawable: 0, unknown: 0 };
      const amount = g._sum.amountCfa ?? 0;
      if (g.direction === null || g.bucket === null) {
        t.unknown += g._count._all;
      } else {
        const signed = g.direction === LedgerDirection.CREDIT ? amount : -amount;
        if (g.bucket === LedgerBucket.HELD) t.held += signed;
        else t.withdrawable += signed;
        if (g.kind === WalletLedgerKind.HELD_RELEASE) t.held -= amount;
      }
      totals.set(g.walletId, t);
    }

    const checks = wallets.map<WalletBalanceCheck>((w) => {
      const t = totals.get(w.id) ?? { held: 0, withdrawable: 0, unknown: 0 };
      const matches = t.held === w.heldCfa && t.withdrawable === w.withdrawableCfa;
      return {
        walletId: w.id,
        tenantId: w.tenantId,
        storedHeldCfa: w.heldCfa,
        storedWithdrawableCfa: w.withdrawableCfa,
        ledgerHeldCfa: t.held,
        ledgerWithdrawableCfa: t.withdrawable,
        unknownEntries: t.unknown,
        status: t.unknown > 0 ? "unverifiable" : matches ? "ok" : "drift"
      };
    });

    return {
      wallets: checks,
      driftCount: checks.filter((c) => c.status === "drift").length,
      unknownEntries: checks.reduce((sum, c) => sum + c.unknownEntries, 0)
    };
  }
}
