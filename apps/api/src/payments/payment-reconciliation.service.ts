import { Injectable, Logger } from "@nestjs/common";
import { PaymentStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentVerifyService } from "./payment-verify.service";

/**
 * Reconciliation job (ADR-017 safety net).
 *
 * The verify-by-pull pipeline only runs when *something* pokes it: a Feexpay
 * webhook, an organizer opening the status page, or a voter's SSE stream while
 * the tab stays open. If ALL of those are absent — webhook lost/never sent, the
 * voter closes the tab right after paying — a real, paid transaction can sit in
 * PENDING forever and the vote never counts. Symmetrically, a payin push that
 * never bound a providerRef (server crashed between init and push, PSP 5xx)
 * leaves an orphan PENDING that can never resolve.
 *
 * This service is the periodic sweep that closes both gaps. It is intentionally
 * side-effect-minimal: it delegates every "confirm" to PaymentVerifyService
 * (the single writer of SUCCEEDED / Vote.paidAt) so all the invariant checks,
 * atomicity and anti-replay guarantees still hold. It only adds one new
 * mutation of its own — expiring truly orphaned PENDING rows to FAILED — and
 * that transition is CAS-guarded and audited.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verifyService: PaymentVerifyService
  ) {}

  /**
   * Sweep PENDING transactions and drive them to a terminal state.
   *
   * @param opts.pullAfterMinutes  Only re-pull tx older than this (default 3).
   *   A grace window avoids racing the synchronous init/webhook path for a tx
   *   that was created seconds ago.
   * @param opts.expireAfterMinutes  Orphan PENDING with no providerRef older
   *   than this are marked FAILED (default 60). Mobile-money USSD prompts expire
   *   well before an hour, so a providerRef-less row this old will never resolve.
   * @param opts.limit  Max rows processed per run (default 200) — bounds the
   *   work per cron tick so a backlog degrades gracefully instead of timing out.
   */
  async reconcilePending(opts?: {
    pullAfterMinutes?: number;
    expireAfterMinutes?: number;
    limit?: number;
  }): Promise<{
    scanned: number;
    applied: number;
    failed: number;
    stillPending: number;
    expired: number;
    skipped: number;
  }> {
    const pullAfterMinutes = opts?.pullAfterMinutes ?? 3;
    const expireAfterMinutes = opts?.expireAfterMinutes ?? 60;
    const limit = opts?.limit ?? 200;

    const now = Date.now();
    const pullCutoff = new Date(now - pullAfterMinutes * 60_000);
    const expireCutoff = new Date(now - expireAfterMinutes * 60_000);

    const pending = await this.prisma.client.paymentTransaction.findMany({
      where: { status: PaymentStatus.PENDING, createdAt: { lt: pullCutoff } },
      select: { id: true, providerRef: true, createdAt: true, tenantId: true },
      orderBy: { createdAt: "asc" },
      take: limit
    });

    const summary = {
      scanned: pending.length,
      applied: 0,
      failed: 0,
      stillPending: 0,
      expired: 0,
      skipped: 0
    };

    for (const tx of pending) {
      // Orphan (no providerRef): the PSP push never bound a reference, so a pull
      // is impossible. Expire it once it is old enough; otherwise leave it for a
      // later tick (a push may still be in flight).
      if (!tx.providerRef) {
        if (tx.createdAt < expireCutoff) {
          await this.expireOrphan(tx.id, tx.tenantId);
          summary.expired += 1;
        } else {
          summary.skipped += 1;
        }
        continue;
      }

      // Has a providerRef → funnel through the authoritative verify-by-pull.
      // verifyAndApplyByReference is fully idempotent and CAS-guarded, so a race
      // with a webhook or another cron tick is safe.
      try {
        const result = await this.verifyService.verifyAndApplyByReference(tx.providerRef);
        switch (result.outcome) {
          case "applied":
            summary.applied += 1;
            break;
          case "failed":
            summary.failed += 1;
            break;
          case "still_pending":
            summary.stillPending += 1;
            break;
          default:
            summary.skipped += 1;
        }
      } catch (err) {
        // A single bad row must never abort the whole sweep.
        this.logger.warn({
          msg: "payment.reconcile.row_failed",
          txId: tx.id,
          err: err instanceof Error ? err.message : String(err)
        });
        summary.skipped += 1;
      }
    }

    this.logger.log({ msg: "payment.reconcile.done", ...summary });
    return summary;
  }

  /**
   * Mark an orphan PENDING (no providerRef) as FAILED. CAS-guarded on PENDING so
   * a concurrent push that just bound a reference is never clobbered, and the
   * transition is audited for traceability.
   */
  private async expireOrphan(txId: string, tenantId: string): Promise<void> {
    await this.prisma.client.$transaction(async (trx) => {
      const updated = await trx.paymentTransaction.updateMany({
        where: { id: txId, status: PaymentStatus.PENDING, providerRef: null },
        data: { status: PaymentStatus.FAILED }
      });
      if (updated.count === 0) return;
      await trx.auditLog.create({
        data: {
          tenantId,
          actorUserId: "system:payment:reconcile",
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.expired_orphan",
          targetType: "PaymentTransaction",
          targetId: txId,
          metadata: { reason: "no_provider_ref_timeout" }
        }
      });
    });
  }
}
