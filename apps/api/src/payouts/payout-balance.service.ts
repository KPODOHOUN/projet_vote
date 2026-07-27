import { Injectable } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type BalanceWindow = { from: Date; to: Date };

export type OrganizerBalance = {
  tenantId: string;
  grossCfa: number;
  commissionCfa: number;
  netCfa: number;
  lines: Array<{ paymentTransactionId: string; amountCfa: number; commissionCfa: number }>;
};

export type OrganizerBalanceWithDebt = OrganizerBalance & {
  debtCfa: number;
  recoveryCfa: number;
  payableCfa: number;
  debtRecoveries: Array<{ debtId: string; amountCfa: number }>;
};

export type PlatformBalance = {
  commissionCfa: number;
  activationFeesCfa: number;
  confiscatedCfa: number;
  activationRecoveryCfa: number;
  totalCfa: number;
  commissionLines: Array<{ paymentTransactionId: string; commissionCfa: number }>;
  activationLines: Array<{ paymentTransactionId: string; amountCfa: number }>;
  confiscationLines: Array<{ vaultEntryId: string; amountCfa: number }>;
  activationRecoveryLines: Array<{ activationRecoveryId: string; amountCfa: number }>;
};

/**
 * Stateless balance calculator. Reads SUCCEEDED revenue inside a window and
 * subtracts anything already pinned to a PayoutLine, so a revenue row is counted
 * at most once across all payout periods (the foundation of the one-revenue-one-
 * payout guarantee — the DB unique index on PayoutLine enforces the rest).
 */
@Injectable()
export class PayoutBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async computeOrganizerBalance(tenantId: string, window: BalanceWindow): Promise<OrganizerBalance> {
    const payments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        tenantId,
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { id: true, amountCfa: true, commissionCfa: true }
    });
    const fresh = await this.excludePinnedPayments(payments, (p) => p.id);
    const grossCfa = fresh.reduce((acc, p) => acc + p.amountCfa, 0);
    const commissionCfa = fresh.reduce((acc, p) => acc + (p.commissionCfa ?? 0), 0);
    return {
      tenantId,
      grossCfa,
      commissionCfa,
      netCfa: grossCfa - commissionCfa,
      lines: fresh.map((p) => ({
        paymentTransactionId: p.id,
        amountCfa: p.amountCfa,
        commissionCfa: p.commissionCfa ?? 0
      }))
    };
  }

  async computeOrganizerBalanceWithDebt(
    tenantId: string,
    window: BalanceWindow
  ): Promise<OrganizerBalanceWithDebt> {
    const base = await this.computeOrganizerBalance(tenantId, window);
    const debts = await this.prisma.client.activationDebt.findMany({
      where: { tenantId, status: "OUTSTANDING" },
      orderBy: { createdAt: "asc" }
    });
    let remainingNet = base.netCfa;
    let recoveryCfa = 0;
    const debtRecoveries: Array<{ debtId: string; amountCfa: number }> = [];
    for (const debt of debts) {
      if (remainingNet <= 0) break;
      const due = debt.amountCfa - debt.recoveredCfa;
      const take = Math.min(due, remainingNet);
      if (take > 0) {
        recoveryCfa += take;
        remainingNet -= take;
        debtRecoveries.push({ debtId: debt.id, amountCfa: take });
      }
    }
    return {
      ...base,
      debtCfa: debts.reduce((acc, d) => acc + (d.amountCfa - d.recoveredCfa), 0),
      recoveryCfa,
      payableCfa: Math.max(0, base.netCfa - recoveryCfa),
      debtRecoveries
    };
  }

  async computePlatformBalance(window: BalanceWindow): Promise<PlatformBalance> {
    const votePayments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { id: true, commissionCfa: true }
    });
    const activationPayments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.ACTIVATION,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { id: true, amountCfa: true }
    });
    const vaults = await this.prisma.client.vaultEntry.findMany({
      where: { occurredAt: { gte: window.from, lte: window.to } },
      select: { id: true, amountCfa: true }
    });
    const recoveries = await this.prisma.client.activationRecovery.findMany({
      where: { createdAt: { gte: window.from, lte: window.to } },
      select: { id: true, amountCfa: true }
    });

    const freshVotes = await this.excludePinnedPayments(votePayments, (p) => p.id);
    const freshActs = await this.excludePinnedPayments(activationPayments, (p) => p.id);
    const freshVaults = await this.excludePinnedVaults(vaults);
    const freshRecoveries = await this.excludePinnedRecoveries(recoveries);

    const commissionCfa = freshVotes.reduce((acc, p) => acc + (p.commissionCfa ?? 0), 0);
    const activationFeesCfa = freshActs.reduce((acc, p) => acc + p.amountCfa, 0);
    const confiscatedCfa = freshVaults.reduce((acc, v) => acc + v.amountCfa, 0);
    const activationRecoveryCfa = freshRecoveries.reduce((acc, r) => acc + r.amountCfa, 0);

    return {
      commissionCfa,
      activationFeesCfa,
      confiscatedCfa,
      activationRecoveryCfa,
      totalCfa: commissionCfa + activationFeesCfa + confiscatedCfa + activationRecoveryCfa,
      commissionLines: freshVotes.map((p) => ({ paymentTransactionId: p.id, commissionCfa: p.commissionCfa ?? 0 })),
      activationLines: freshActs.map((p) => ({ paymentTransactionId: p.id, amountCfa: p.amountCfa })),
      confiscationLines: freshVaults.map((v) => ({ vaultEntryId: v.id, amountCfa: v.amountCfa })),
      activationRecoveryLines: freshRecoveries.map((r) => ({
        activationRecoveryId: r.id,
        amountCfa: r.amountCfa
      }))
    };
  }

  /** Tenants with ≥1 unpinned SUCCEEDED VOTE payment in the window. */
  async listTenantsWithBalance(window: BalanceWindow): Promise<string[]> {
    const rows = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: PaymentPurpose.VOTE,
        updatedAt: { gte: window.from, lte: window.to }
      },
      select: { tenantId: true },
      distinct: ["tenantId"]
    });
    return rows.map((r) => r.tenantId);
  }

  private async excludePinnedPayments<T>(rows: T[], idOf: (row: T) => string): Promise<T[]> {
    if (rows.length === 0) return rows;
    const ids = rows.map(idOf);
    const pinned = new Set(
      (
        await this.prisma.client.payoutLine.findMany({
          where: { paymentTransactionId: { in: ids } },
          select: { paymentTransactionId: true }
        })
      )
        .map((l) => l.paymentTransactionId)
        .filter((v): v is string => v !== null)
    );
    return rows.filter((r) => !pinned.has(idOf(r)));
  }

  private async excludePinnedRecoveries<T extends { id: string }>(rows: T[]): Promise<T[]> {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const pinned = new Set(
      (
        await this.prisma.client.payoutLine.findMany({
          where: { activationRecoveryId: { in: ids } },
          select: { activationRecoveryId: true }
        })
      )
        .map((l) => l.activationRecoveryId)
        .filter((v): v is string => v !== null)
    );
    return rows.filter((r) => !pinned.has(r.id));
  }

  private async excludePinnedVaults<T extends { id: string }>(rows: T[]): Promise<T[]> {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const pinned = new Set(
      (
        await this.prisma.client.payoutLine.findMany({
          where: { vaultEntryId: { in: ids } },
          select: { vaultEntryId: true }
        })
      )
        .map((l) => l.vaultEntryId)
        .filter((v): v is string => v !== null)
    );
    return rows.filter((r) => !pinned.has(r.id));
  }
}
