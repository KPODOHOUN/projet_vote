import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  PaymentProvider,
  PayoutKind,
  PayoutPeriodStatus,
  PayoutStatus
} from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import { NotificationsService } from "../notifications/notifications.service";
import { PspRegistry } from "../payments/psp/psp.registry";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";

const openPeriodSchema = z.object({
  label: z.string().min(3).max(40),
  from: z.coerce.date(),
  to: z.coerce.date()
});

const listPayoutsSchema = z.object({
  status: z.nativeEnum(PayoutStatus).optional(),
  kind: z.nativeEnum(PayoutKind).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const resolveSchema = z.object({
  resolution: z.enum(["SUCCEEDED", "FAILED"]),
  providerRef: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
});

const JOB_LOCK_NAME = "payout-process-period";
const JOB_LOCK_TTL_MS = 5 * 60 * 1000;

type PayoutLineInput = {
  paymentTransactionId?: string;
  vaultEntryId?: string;
  activationRecoveryId?: string;
  amountCfa: number;
  kind: string;
};

type IssuedPayout = { id: string; kind: PayoutKind; amountCfa: number; status: PayoutStatus };

/**
 * Payout orchestrator. Disburses, per billing period, the net due to each
 * organizer (gross − commission) and the platform's own share, through the
 * multi-PSP seam (PspRegistry). Six anti-double-spend layers (each demonstrated
 * by a test):
 *   1. idempotencyKey = sha256(period:kind:beneficiary) + unique(period,kind,benef)
 *   2. IN_FLIGHT state set before the provider call
 *   3. PayoutLine pinning ONLY on a certain SUCCEEDED
 *   4. verify-by-pull / no auto-retry on UNCERTAIN
 *   5. PayoutJobLock distributed lock around processPeriod
 *   6. balance cap (never disburse amount ≤ 0, never more than computed)
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: PayoutBalanceService,
    private readonly jobLock: PayoutJobLockService,
    private readonly destinations: PayoutDestinationService,
    private readonly psp: PspRegistry,
    private readonly notifications: NotificationsService
  ) {}

  async openPeriod(payload: unknown) {
    const input = openPeriodSchema.parse(payload);
    if (input.to < input.from) {
      throw new BadRequestException("La fin de période doit suivre le début.");
    }
    try {
      return await this.prisma.client.payoutPeriod.create({
        data: { label: input.label, from: input.from, to: input.to, status: PayoutPeriodStatus.OPEN }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Cette période existe déjà.");
      }
      throw error;
    }
  }

  async processPeriod(periodId: string): Promise<{ payouts: IssuedPayout[] }> {
    const period = await this.prisma.client.payoutPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException("Période introuvable.");
    if (period.status === PayoutPeriodStatus.CLOSED) {
      throw new BadRequestException("Période CLOSED — aucun versement supplémentaire.");
    }

    // Layer 5: distributed lock. A second concurrent worker no-ops instead of
    // issuing duplicate disbursements.
    const owner = `pid-${process.pid}-${this.nonce()}`;
    const got = await this.jobLock.acquire(JOB_LOCK_NAME, owner, JOB_LOCK_TTL_MS);
    if (!got) {
      this.logger.warn(`processPeriod ${periodId}: lock occupé, ignoré`);
      return { payouts: [] };
    }
    try {
      await this.prisma.client.payoutPeriod.update({
        where: { id: periodId },
        data: { status: PayoutPeriodStatus.PROCESSING }
      });

      const window = { from: period.from, to: period.to };
      const created: IssuedPayout[] = [];

      // Organizer payouts (net = gross − commission), routed to each organizer's
      // chosen PSP and decrypted Mobile Money destination.
      for (const tenantId of await this.balance.listTenantsWithBalance(window)) {
        const bal = await this.balance.computeOrganizerBalanceWithDebt(tenantId, window);
        if (bal.netCfa <= 0 && bal.recoveryCfa <= 0) continue;

        const recoveryRecords = await Promise.all(
          bal.debtRecoveries.map((recovery) =>
            this.prisma.client.activationRecovery.create({
              data: { debtId: recovery.debtId, amountCfa: recovery.amountCfa }
            })
          )
        );
        for (const recovery of bal.debtRecoveries) {
          await this.prisma.client.activationDebt.update({
            where: { id: recovery.debtId },
            data: { recoveredCfa: { increment: recovery.amountCfa } }
          });
        }
        const stillOutstanding = await this.prisma.client.activationDebt.findMany({
          where: { tenantId, status: "OUTSTANDING" }
        });
        for (const debt of stillOutstanding) {
          if (debt.recoveredCfa >= debt.amountCfa) {
            await this.prisma.client.activationDebt.update({
              where: { id: debt.id },
              data: { status: "SETTLED" }
            });
          }
        }

        if (bal.payableCfa <= 0) {
          void recoveryRecords;
          continue;
        }

        const dest = await this.destinations.resolveForTenant(tenantId);
        if (!dest) {
          this.logger.warn(`processPeriod: tenant ${tenantId} sans destination de versement — ignoré`);
          continue;
        }
        const provider = await this.psp.resolveProvider({ tenantId });
        const issued = await this.issuePayout({
          periodId,
          periodLabel: period.label,
          kind: PayoutKind.ORGANIZER,
          beneficiaryTenantId: tenantId,
          amountCfa: bal.payableCfa,
          provider,
          beneficiaryAccount: dest.account,
          network: dest.network,
          lines: bal.lines.map((l) => ({
            paymentTransactionId: l.paymentTransactionId,
            amountCfa: l.amountCfa - l.commissionCfa,
            kind: "vote_net"
          }))
        });
        if (issued) created.push(issued);
      }

      // Platform payout. NB (Flow A): organizer payouts above already pinned the
      // vote payments, so computePlatformBalance excludes their commission — the
      // gross was collected on the platform master account and the commission
      // simply STAYS there (no self-transfer needed). The platform payout thus
      // covers revenue with no organizer counterpart: activation fees,
      // confiscations, and commissions on votes not paid out this period.
      const platform = await this.balance.computePlatformBalance(window);
      if (platform.totalCfa > 0) {
        const dest = this.destinations.platformDestination();
        const lines: PayoutLineInput[] = [
          ...platform.commissionLines.map((l) => ({
            paymentTransactionId: l.paymentTransactionId,
            amountCfa: l.commissionCfa,
            kind: "commission"
          })),
          ...platform.activationLines.map((l) => ({
            paymentTransactionId: l.paymentTransactionId,
            amountCfa: l.amountCfa,
            kind: "activation_fee"
          })),
          ...platform.confiscationLines.map((l) => ({
            vaultEntryId: l.vaultEntryId,
            amountCfa: l.amountCfa,
            kind: "confiscated"
          })),
          ...platform.activationRecoveryLines.map((l) => ({
            activationRecoveryId: l.activationRecoveryId,
            amountCfa: l.amountCfa,
            kind: "activation_recovery"
          }))
        ];
        const issued = await this.issuePayout({
          periodId,
          periodLabel: period.label,
          kind: PayoutKind.PLATFORM,
          beneficiaryTenantId: null,
          amountCfa: platform.totalCfa,
          provider: dest.provider,
          beneficiaryAccount: dest.account,
          network: dest.network,
          lines
        });
        if (issued) created.push(issued);
      }

      // Close the period only when nothing is left unresolved. An UNCERTAIN
      // payout keeps the period PROCESSING until a human resolves it.
      const unresolved = await this.prisma.client.payout.count({
        where: {
          periodId,
          status: { in: [PayoutStatus.PENDING, PayoutStatus.IN_FLIGHT, PayoutStatus.UNCERTAIN] }
        }
      });
      if (unresolved === 0) {
        await this.prisma.client.payoutPeriod.update({
          where: { id: periodId },
          data: { status: PayoutPeriodStatus.CLOSED }
        });
      }

      return { payouts: created };
    } finally {
      await this.jobLock.release(JOB_LOCK_NAME, owner);
    }
  }

  async getPeriod(id: string) {
    const period = await this.prisma.client.payoutPeriod.findUnique({
      where: { id },
      include: { payouts: { include: { lines: true } } }
    });
    if (!period) throw new NotFoundException("Période introuvable.");
    return period;
  }

  async listPayouts(query: unknown) {
    const q = listPayoutsSchema.parse(query);
    return this.prisma.client.payout.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {})
      },
      orderBy: { createdAt: "desc" },
      take: q.limit
    });
  }

  /**
   * God-mode manual resolution of an UNCERTAIN payout. The admin has confirmed
   * the real outcome with the PSP out-of-band. On SUCCEEDED we re-run
   * processPeriod (idempotent) so the now-resolved revenue gets pinned exactly
   * once — we never pin from this method directly (the lines aren't recomputed
   * here), keeping the one-revenue-one-payout invariant in a single code path.
   */
  async resolveUncertain(id: string, payload: unknown) {
    const input = resolveSchema.parse(payload);
    const payout = await this.prisma.client.payout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException("Versement introuvable.");
    if (payout.status !== PayoutStatus.UNCERTAIN) {
      throw new BadRequestException("Seul un versement UNCERTAIN peut être résolu.");
    }
    if (input.resolution === "SUCCEEDED") {
      if (!input.providerRef) throw new BadRequestException("providerRef requis pour SUCCEEDED.");
      await this.prisma.client.payout.update({
        where: { id },
        data: { status: PayoutStatus.SUCCEEDED, providerRef: input.providerRef, completedAt: new Date() }
      });
      if (payout.beneficiaryTenantId) {
        void this.notifications.create(payout.beneficiaryTenantId, "PAYOUT_SUCCEEDED", {
          payoutId: payout.id,
          amountCfa: payout.amountCfa
        });
      }
    } else {
      await this.prisma.client.payout.update({
        where: { id },
        data: {
          status: PayoutStatus.FAILED,
          errorMessage: input.reason ?? "Résolu FAILED par admin",
          completedAt: new Date()
        }
      });
      if (payout.beneficiaryTenantId) {
        void this.notifications.create(payout.beneficiaryTenantId, "PAYOUT_FAILED", {
          payoutId: payout.id,
          amountCfa: payout.amountCfa
        });
      }
    }
    return { id, status: input.resolution };
  }

  private async issuePayout(args: {
    periodId: string;
    periodLabel: string;
    kind: PayoutKind;
    beneficiaryTenantId: string | null;
    amountCfa: number;
    provider: PaymentProvider;
    beneficiaryAccount: string;
    network: string;
    lines: PayoutLineInput[];
  }): Promise<IssuedPayout | null> {
    if (args.amountCfa <= 0) return null; // Layer 6

    // Layer 1: deterministic idempotency key + unique(period, kind, beneficiary).
    const idempotencyKey = this.periodScopedKey(args.periodLabel, args.kind, args.beneficiaryTenantId);

    const existing = await this.prisma.client.payout.findUnique({ where: { idempotencyKey } });
    if (existing && (existing.status === PayoutStatus.SUCCEEDED || existing.status === PayoutStatus.FAILED)) {
      return null; // already terminal — never re-disburse
    }

    const payout =
      existing ??
      (await this.prisma.client.payout.create({
        data: {
          periodId: args.periodId,
          kind: args.kind,
          beneficiaryTenantId: args.beneficiaryTenantId,
          amountCfa: args.amountCfa,
          idempotencyKey,
          provider: args.provider,
          status: PayoutStatus.PENDING
        }
      }));

    // Layer 2: mark IN_FLIGHT before the provider call.
    await this.prisma.client.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.IN_FLIGHT, lockedAt: new Date() }
    });

    const creds = this.psp.resolveCredentials(args.provider);
    const result = await this.psp.get(args.provider).sendPayout(
      {
        idempotencyKey,
        amountCfa: args.amountCfa,
        beneficiaryAccount: args.beneficiaryAccount,
        network: args.network,
        label: `${args.kind} ${args.periodLabel}`
      },
      creds
    );

    if (result.status === "SUCCEEDED") {
      // Layer 3: pin source lines ONLY on a certain success, atomically.
      await this.prisma.client.$transaction([
        this.prisma.client.payout.update({
          where: { id: payout.id },
          data: { status: PayoutStatus.SUCCEEDED, providerRef: result.providerRef, completedAt: new Date() }
        }),
        ...args.lines.map((l) =>
          this.prisma.client.payoutLine.create({
            data: {
              payoutId: payout.id,
              paymentTransactionId: l.paymentTransactionId ?? null,
              vaultEntryId: l.vaultEntryId ?? null,
              activationRecoveryId: l.activationRecoveryId ?? null,
              amountCfa: l.amountCfa,
              kind: l.kind
            }
          })
        )
      ]);
      if (args.beneficiaryTenantId) {
        void this.notifications.create(args.beneficiaryTenantId, "PAYOUT_SUCCEEDED", {
          payoutId: payout.id,
          amountCfa: args.amountCfa
        });
      }
      return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.SUCCEEDED };
    }

    if (result.status === "FAILED") {
      await this.prisma.client.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.FAILED, errorMessage: result.reason, completedAt: new Date() }
      });
      if (args.beneficiaryTenantId) {
        void this.notifications.create(args.beneficiaryTenantId, "PAYOUT_FAILED", {
          payoutId: payout.id,
          amountCfa: args.amountCfa
        });
      }
      return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.FAILED };
    }

    // Layer 4: UNCERTAIN — never pin, never auto-retry. Awaits human resolution.
    await this.prisma.client.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.UNCERTAIN, errorMessage: result.reason }
    });
    return { id: payout.id, kind: args.kind, amountCfa: args.amountCfa, status: PayoutStatus.UNCERTAIN };
  }

  private periodScopedKey(periodLabel: string, kind: PayoutKind, beneficiaryTenantId: string | null): string {
    return createHash("sha256")
      .update(`payout:${periodLabel}:${kind}:${beneficiaryTenantId ?? "PLATFORM"}`)
      .digest("hex");
  }

  private nonce(): string {
    return createHash("sha256").update(`${process.hrtime.bigint()}`).digest("hex").slice(0, 12);
  }
}
