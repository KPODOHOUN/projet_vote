import { Injectable, Logger } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus, UserRole, TicketStatus } from "@prisma/client";
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
   * @param opts.abandonAfterHours  PENDING rows WITH a providerRef that the
   *   provider still reports pending (or that keep failing verification) after
   *   this long are marked FAILED (default 24) and audited for a manual check.
   * @param opts.ticketHoldMinutes  A ticket purchase (with or without a
   *   providerRef) still unpaid after this long is abandoned (default 15) so its
   *   seats go back on sale: one buyer who never confirms the USSD prompt must
   *   not block the others. A payment confirmed after that is recovered by
   *   PaymentVerifyService (tickets re-issued if seats remain, else flagged for refund).
   * @param opts.limit  Max rows processed per run (default 200) — bounds the
   *   work per cron tick so a backlog degrades gracefully instead of timing out.
   *   Rows are taken least-recently-examined first and touched after each
   *   attempt, so stuck rows can never starve newer ones.
   */
  async reconcilePending(opts?: {
    pullAfterMinutes?: number;
    expireAfterMinutes?: number;
    abandonAfterHours?: number;
    ticketHoldMinutes?: number;
    limit?: number;
  }): Promise<{
    scanned: number;
    applied: number;
    failed: number;
    stillPending: number;
    expired: number;
    abandoned: number;
    skipped: number;
  }> {
    const pullAfterMinutes = opts?.pullAfterMinutes ?? 3;
    const expireAfterMinutes = opts?.expireAfterMinutes ?? 60;
    const abandonAfterHours = opts?.abandonAfterHours ?? 24;
    const ticketHoldMinutes = opts?.ticketHoldMinutes ?? 15;
    const limit = opts?.limit ?? 200;

    const now = Date.now();
    const pullCutoff = new Date(now - pullAfterMinutes * 60_000);
    const expireCutoff = new Date(now - expireAfterMinutes * 60_000);
    const abandonCutoff = new Date(now - abandonAfterHours * 3_600_000);
    const ticketHoldCutoff = new Date(now - ticketHoldMinutes * 60_000);

    const pending = await this.prisma.client.paymentTransaction.findMany({
      where: { status: PaymentStatus.PENDING, createdAt: { lt: pullCutoff } },
      select: { id: true, providerRef: true, createdAt: true, tenantId: true, purpose: true },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
      take: limit
    });

    const summary = {
      scanned: pending.length,
      applied: 0,
      failed: 0,
      stillPending: 0,
      expired: 0,
      abandoned: 0,
      skipped: 0
    };

    for (const tx of pending) {
      const isTicket = tx.purpose === PaymentPurpose.TICKET;
      // Orphan (no providerRef): the PSP push never bound a reference, so a pull
      // is impossible. Expire it once it is old enough; otherwise leave it for a
      // later tick (a push may still be in flight).
      if (!tx.providerRef) {
        if (tx.createdAt < (isTicket ? ticketHoldCutoff : expireCutoff)) {
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
      let unresolved = false;
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
            unresolved = true;
            break;
          case "ignored_terminal":
            summary.skipped += 1;
            break;
          default:
            summary.skipped += 1;
            unresolved = true;
        }
      } catch (err) {
        // A single bad row must never abort the whole sweep.
        this.logger.warn({
          msg: "payment.reconcile.row_failed",
          txId: tx.id,
          err: err instanceof Error ? err.message : String(err)
        });
        summary.skipped += 1;
        unresolved = true;
      }
      if (!unresolved) continue;
      if (tx.createdAt < (isTicket ? ticketHoldCutoff : abandonCutoff)) {
        const reason = isTicket ? "ticket_hold_timeout" : "provider_unresolved_timeout";
        if (await this.abandonPending(tx.id, tx.tenantId, tx.providerRef, reason)) summary.abandoned += 1;
      } else {
        // Back of the queue: the next tick examines the rows not seen for longest.
        await this.prisma.client.paymentTransaction.updateMany({
          where: { id: tx.id, status: PaymentStatus.PENDING },
          data: { updatedAt: new Date() }
        });
      }
    }

    this.logger.log({ msg: "payment.reconcile.done", ...summary });
    return summary;
  }

  /**
   * Give up on a PENDING row the provider never resolved: FAILED, its tickets
   * released, audited. If the provider confirms it later, PaymentVerifyService
   * recovers it (late success). CAS-guarded on PENDING.
   */
  private async abandonPending(txId: string, tenantId: string, providerRef: string, reason: string): Promise<boolean> {
    return this.prisma.client.$transaction(async (trx) => {
      const updated = await trx.paymentTransaction.updateMany({
        where: { id: txId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED }
      });
      if (updated.count === 0) return false;
      await trx.ticket.updateMany({
        where: { paymentTransactionId: txId, status: TicketStatus.RESERVED },
        data: { status: TicketStatus.CANCELLED }
      });
      await trx.auditLog.create({
        data: {
          tenantId,
          actorUserId: "system:payment:reconcile",
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.abandoned_pending",
          targetType: "PaymentTransaction",
          targetId: txId,
          metadata: { reason, providerRef }
        }
      });
      return true;
    });
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
      await trx.ticket.updateMany({
        where: { paymentTransactionId: txId, status: TicketStatus.RESERVED },
        data: { status: TicketStatus.CANCELLED }
      });
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
