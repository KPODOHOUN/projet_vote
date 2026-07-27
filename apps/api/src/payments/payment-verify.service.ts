import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { PaymentPurpose, PaymentProvider, PaymentStatus, UserRole, AccountPlanType, AccountPlanStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { resolvePartnerVoteCommissionBps } from "../partners/partner-tier.util";
import { PspRegistry } from "./psp/psp.registry";
import { parseStrictProviderAmount } from "./psp/parse-provider-amount";
import type { FeexpayStatusPayload } from "./feexpay/feexpay.types";
import {
  COMMISSION_BPS_KEY,
  parseIntSetting
} from "../common/platform-settings";

/**
 * Verify-by-pull pipeline (ADR-017).
 *
 * This service is the ONLY component allowed to flip a PaymentTransaction to
 * SUCCEEDED and to stamp Vote.paidAt. Every code path that "confirms a
 * payment" must funnel through `verifyAndApplyByReference`. The contract:
 *
 *   1. Look up `tx` by `providerRef`.
 *   2. Pull authoritative status from Feexpay (server-to-server).
 *   3. Reject if any of {status, amount, currency, tx.status} is wrong.
 *   4. On success: a SINGLE prisma.$transaction performs
 *      [update tx → SUCCEEDED + commissionCfa, update vote → paidAt, audit].
 *      Atomicity guarantees ledger ↔ tally consistency under crash.
 *
 * The pull-side guard is what closes the "free vote inflation" hole: the only
 * way to set Vote.paidAt is to convince Feexpay (server-to-server, behind
 * their API key) that a transaction with the same reference, amount and
 * currency actually SUCCEEDED.
 */
@Injectable()
export class PaymentVerifyService {
  private readonly logger = new Logger(PaymentVerifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly pspRegistry: PspRegistry
  ) { }

  /**
   * The reference here is the value Feexpay echoes back in the webhook (or that
   * we stored as providerRef at init time). It is the join key into our
   * PaymentTransaction table.
   */
  async verifyAndApplyByReference(reference: string): Promise<{
    outcome: "applied" | "failed" | "still_pending" | "ignored_terminal" | "rejected";
    reason?: string;
    transactionId?: string;
  }> {
    if (!reference) {
      return { outcome: "rejected", reason: "missing_reference" };
    }

    const tx = await this.prisma.client.paymentTransaction.findUnique({
      where: { providerRef: reference }
    });
    if (!tx) {
      // We received a webhook for a reference we never initialized. Either a
      // probe from an attacker, or a webhook from a sibling/legacy integration.
      // We do NOT write to AuditLog here: AuditLog.tenantId is a foreign key
      // and an orphan reference has no tenant, so a DB write would either fail
      // or require a synthetic tenant (which itself becomes an attack surface
      // for log spam). We surface the event to the structured logger instead;
      // SIEM/alerting can catch a burst of `unknown_reference` warnings.
      this.logger.warn({
        msg: "payment.verify.unknown_reference",
        reference
      });
      return { outcome: "rejected", reason: "unknown_reference" };
    }

    // Anti-rejeu / anti-VOIDED-flip: if the transaction is already in a
    // terminal state, we never re-process it. A platform admin who VOIDED a
    // payment must not see it silently flipped back to SUCCEEDED by a delayed
    // webhook.
    if (
      tx.status === PaymentStatus.SUCCEEDED ||
      tx.status === PaymentStatus.FAILED ||
      tx.status === PaymentStatus.VOIDED
    ) {
      return { outcome: "ignored_terminal", transactionId: tx.id, reason: tx.status };
    }

    // Source of truth: server-to-server pull (credentials organisateur ou plateforme).
    let pull: FeexpayStatusPayload;
    try {
      pull = await this.fetchAuthoritativeStatus(tx, reference);
    } catch (err) {
      // Transient failure: keep tx PENDING, the reconciliation cron will retry.
      this.logger.warn({
        msg: "payment.pull_failed",
        reference,
        txId: tx.id,
        err: err instanceof Error ? err.message : String(err)
      });
      return { outcome: "still_pending", transactionId: tx.id, reason: "pull_failed" };
    }

    if (pull.status === "PENDING") {
      return { outcome: "still_pending", transactionId: tx.id };
    }

    if (pull.status === "FAILED") {
      await this.markFailed(tx.id, tx.tenantId, pull.reason ?? "feexpay_reported_failed");
      return { outcome: "failed", transactionId: tx.id, reason: pull.reason ?? "feexpay_reported_failed" };
    }

    // pull.status === "SUCCESSFUL" — apply the mandatory invariants BEFORE
    // any mutation. Each failure here means somebody (or something) is trying
    // to count a vote that wasn't actually paid for; we refuse loudly.
    const pulledAmount = this.parseAmount(pull.amount);
    if (pulledAmount === null) {
      await this.auditReject({
        tenantId: tx.tenantId,
        transactionId: tx.id,
        reason: "amount_unparseable",
        metadata: { reference, providerAmount: pull.amount }
      });
      return { outcome: "rejected", reason: "amount_unparseable", transactionId: tx.id };
    }
    if (pulledAmount !== tx.amountCfa) {
      await this.auditReject({
        tenantId: tx.tenantId,
        transactionId: tx.id,
        reason: "amount_mismatch",
        metadata: {
          reference,
          expectedAmount: tx.amountCfa,
          providerAmount: pulledAmount
        }
      });
      return { outcome: "rejected", reason: "amount_mismatch", transactionId: tx.id };
    }
    if (pull.currency && pull.currency !== tx.currency) {
      await this.auditReject({
        tenantId: tx.tenantId,
        transactionId: tx.id,
        reason: "currency_mismatch",
        metadata: {
          reference,
          expectedCurrency: tx.currency,
          providerCurrency: pull.currency
        }
      });
      return { outcome: "rejected", reason: "currency_mismatch", transactionId: tx.id };
    }

    // All invariants OK — commit atomically.
    const commissionCfa =
      tx.purpose === PaymentPurpose.VOTE
        ? await this.resolveCommissionCfa(tx.eventId, tx.amountCfa)
        : null;

    await this.prisma.client.$transaction(async (trx) => {
      // CAS-style guard: only flip from PENDING. Prevents a concurrent
      // reconciliation pull from double-applying.
      const updated = await trx.paymentTransaction.updateMany({
        where: { id: tx.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.SUCCEEDED,
          ...(commissionCfa !== null ? { commissionCfa } : {})
        }
      });
      if (updated.count === 0) {
        // Lost a race against another worker — that worker also applied
        // exactly the same state, so this is safe to no-op.
        return;
      }

      if (tx.purpose === PaymentPurpose.VOTE && tx.voteId) {
        await trx.vote.update({
          where: { id: tx.voteId },
          data: { paidAt: new Date() }
        });
      } else if (tx.purpose === PaymentPurpose.ACTIVATION) {
        await trx.event.update({
          where: { id: tx.eventId },
          data: { activationPaidAt: new Date() }
        });
      } else if (tx.purpose === PaymentPurpose.SUBSCRIPTION) {
        // Activate subscription: derive durationMonths from the paid amount.
        await this.activateSubscriptionFromPayment(trx, tx.tenantId, tx.id, tx.amountCfa);
      } else if (tx.purpose === PaymentPurpose.TICKET) {
        await trx.ticket.updateMany({
          where: { eventId: tx.eventId, status: "RESERVED" as any },
          data: { status: "PAID" as any, paidAt: new Date(), confirmedAt: new Date() }
        });
      }

      await trx.auditLog.create({
        data: {
          tenantId: tx.tenantId,
          actorUserId: "system:payment:verify",
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.verified_applied",
          targetType: "PaymentTransaction",
          targetId: tx.id,
          metadata: {
            providerRef: reference,
            amountCfa: tx.amountCfa,
            currency: tx.currency,
            purpose: tx.purpose,
            ...(commissionCfa !== null ? { commissionCfa } : {})
          }
        }
      });
    });

    if (tx.purpose === PaymentPurpose.VOTE) {
      this.notifyPaymentSucceeded(tx.tenantId, tx.eventId, tx.amountCfa);
    } else if (tx.purpose === PaymentPurpose.SUBSCRIPTION) {
      this.notifications
        .create(tx.tenantId, "SUBSCRIPTION_ACTIVATED", {
          amountCfa: tx.amountCfa,
          transactionId: tx.id
        })
        .catch((err) => {
          this.logger.warn({
            msg: "subscription.notify_failed",
            tenantId: tx.tenantId,
            err: err instanceof Error ? err.message : String(err)
          });
        });
    }

    return { outcome: "applied", transactionId: tx.id };
  }

  /**
   * Side-channel notification: never allowed to fail the payment. A rejected
   * write here (transient DB blip) must be logged, not swallowed as an
   * unhandled rejection, and must not roll back the already-committed ledger.
   */
  private notifyPaymentSucceeded(tenantId: string, eventId: string, amountCfa: number): void {
    this.notifications
      .create(tenantId, "PAYMENT_SUCCEEDED", { eventId, amountCfa })
      .catch((err) => {
        this.logger.warn({
          msg: "payment.notify_failed",
          tenantId,
          eventId,
          err: err instanceof Error ? err.message : String(err)
        });
      });
  }

  /**
   * Surface the typed error to callers that explicitly want a not-found
   * (organizer dashboards, etc.). Webhook callers use the soft outcome above.
   */
  async verifyAndApplyByReferenceOrThrow(reference: string) {
    const result = await this.verifyAndApplyByReference(reference);
    if (result.outcome === "rejected" && result.reason === "unknown_reference") {
      throw new NotFoundException("Transaction introuvable.");
    }
    if (result.outcome === "rejected") {
      throw new ConflictException(`Vérification refusée: ${result.reason ?? "unknown"}.`);
    }
    return result;
  }

  /** Mode démo : confirme un paiement PENDING sans pull PSP. */
  async applyDemoSuccess(transactionId: string): Promise<void> {
    const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.status !== PaymentStatus.PENDING) {
      return;
    }

    const commissionCfa =
      tx.purpose === PaymentPurpose.VOTE
        ? await this.resolveCommissionCfa(tx.eventId, tx.amountCfa)
        : null;

    await this.prisma.client.$transaction(async (trx) => {
      const updated = await trx.paymentTransaction.updateMany({
        where: { id: tx.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.SUCCEEDED,
          ...(commissionCfa !== null ? { commissionCfa } : {})
        }
      });
      if (updated.count === 0) {
        return;
      }

      if (tx.purpose === PaymentPurpose.VOTE && tx.voteId) {
        await trx.vote.update({
          where: { id: tx.voteId },
          data: { paidAt: new Date() }
        });
      } else if (tx.purpose === PaymentPurpose.ACTIVATION) {
        await trx.event.update({
          where: { id: tx.eventId },
          data: { activationPaidAt: new Date() }
        });
      } else if (tx.purpose === PaymentPurpose.TICKET) {
        await trx.ticket.updateMany({
          where: { eventId: tx.eventId, status: "RESERVED" as any },
          data: { status: "PAID" as any, paidAt: new Date(), confirmedAt: new Date() }
        });
      }

      await trx.auditLog.create({
        data: {
          tenantId: tx.tenantId,
          actorUserId: "system:payments:demo",
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.verified_applied",
          targetType: "PaymentTransaction",
          targetId: tx.id,
          metadata: {
            providerRef: tx.providerRef,
            amountCfa: tx.amountCfa,
            currency: tx.currency,
            purpose: tx.purpose,
            demo: true,
            ...(commissionCfa !== null ? { commissionCfa } : {})
          }
        }
      });
    });

    if (tx.purpose === PaymentPurpose.VOTE) {
      this.notifyPaymentSucceeded(tx.tenantId, tx.eventId, tx.amountCfa);
    }
  }

  private async fetchAuthoritativeStatus(
    tx: {
      eventId: string;
      tenantId: string;
      provider: PaymentProvider;
      purpose: PaymentPurpose;
    },
    reference: string
  ): Promise<FeexpayStatusPayload> {
    const gateway = this.pspRegistry.get(tx.provider);
    const creds =
      tx.purpose === PaymentPurpose.ACTIVATION
        ? await this.pspRegistry.resolvePlatformCredentials(tx.provider)
        : await this.pspRegistry.resolveVotePayinCredentials({
          eventId: tx.eventId,
          tenantId: tx.tenantId
        });
    const result = await gateway.fetchPayinStatus(reference, creds);
    const status: FeexpayStatusPayload["status"] =
      result.status === "SUCCEEDED" ? "SUCCESSFUL" : result.status;
    return {
      status,
      amount: result.providerAmount ?? result.amountCfa,
      currency: result.currency,
      reason: result.reason
    };
  }

  private parseAmount(raw: string | number | undefined): number | null {
    return parseStrictProviderAmount(raw);
  }

  private async markFailed(txId: string, tenantId: string, reason: string): Promise<void> {
    await this.prisma.client.$transaction(async (trx) => {
      const updated = await trx.paymentTransaction.updateMany({
        where: { id: txId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED }
      });
      if (updated.count === 0) return;
      await trx.auditLog.create({
        data: {
          tenantId,
          actorUserId: "system:payment:verify",
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.verified_failed",
          targetType: "PaymentTransaction",
          targetId: txId,
          metadata: { reason }
        }
      });
    });
  }

  private async auditReject(args: {
    tenantId: string;
    transactionId: string | null;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: "system:payment:verify",
        actorRole: UserRole.PLATFORM_ADMIN,
        action: "payment.verify_rejected",
        targetType: "PaymentTransaction",
        targetId: args.transactionId,
        metadata: { reason: args.reason, ...args.metadata }
      }
    });
  }

  private async resolveCommissionCfa(eventId: string, amountCfa: number): Promise<number> {
    // If the event belongs to a tenant with an active subscription, use the
    // frozen commission rate from the subscription (if available).
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: {
        commissionBps: true,
        isPartnerEvent: true,
        partnerPlatformShareBps: true,
        tenantId: true,
        createdAt: true,
        tenant: { select: { commissionBps: true, isPartner: true, partnerCommissionBps: true } }
      }
    });

    // Check for frozen commission from active account subscription first.
    if (event?.tenantId) {
      const activeSub = await this.prisma.client.accountSubscription.findFirst({
        where: {
          tenantId: event.tenantId,
          status: AccountPlanStatus.ACTIVE,
          expiresAt: { gt: new Date() }
        },
        orderBy: { expiresAt: "desc" },
        select: { frozenCommissionBps: true, partnerCommissionBps: true, planType: true }
      });
      if (activeSub) {
        // Partner subscriptions use their partner-specific rate.
        const bps = activeSub.planType === AccountPlanType.PARTNER
          ? (activeSub.partnerCommissionBps ?? activeSub.frozenCommissionBps)
          : activeSub.frozenCommissionBps;
        if (bps > 0) {
          return Math.floor((amountCfa * bps) / 10_000);
        }
        return 0;
      }

      // Check if there was an active PARTNER subscription when the event was created (grace period).
      if (event.createdAt) {
        const subDuringCreation = await this.prisma.client.accountSubscription.findFirst({
          where: {
            tenantId: event.tenantId,
            planType: AccountPlanType.PARTNER,
            startsAt: { lte: event.createdAt },
            expiresAt: { gte: event.createdAt }
          },
          orderBy: { expiresAt: "desc" },
          select: { partnerCommissionBps: true, frozenCommissionBps: true }
        });
        if (subDuringCreation) {
          const bps = subDuringCreation.partnerCommissionBps ?? subDuringCreation.frozenCommissionBps;
          if (bps > 0) {
            return Math.floor((amountCfa * bps) / 10_000);
          }
          return 0;
        }
      }
    }

    // Fallback to the existing resolution chain for tenants without a subscription.
    let bps = event?.commissionBps ?? null;
    if (bps === null && event?.isPartnerEvent && event.partnerPlatformShareBps != null) {
      bps = await resolvePartnerVoteCommissionBps(
        this.prisma.client,
        eventId,
        event.partnerPlatformShareBps,
        amountCfa
      );
    }
    if (bps === null && event?.tenant.isPartner && event.tenant.partnerCommissionBps != null) {
      bps = event.tenant.partnerCommissionBps;
    }
    if (bps === null) {
      bps = event?.tenant.commissionBps ?? null;
    }
    if (bps === null) {
      const setting = await this.prisma.client.platformSetting.findUnique({
        where: { key: COMMISSION_BPS_KEY }
      });
      bps = setting ? Number.parseInt(setting.value, 10) : 0;
    }
    if (!Number.isFinite(bps) || bps === null || bps <= 0) {
      return 0;
    }
    return Math.floor((amountCfa * bps) / 10_000);
  }

  /**
   * Activate a Standard subscription when a SUBSCRIPTION payment succeeds.
   * Called within the atomic $transaction block.
   * Tente de rattacher le Plan correspondant au montant payé.
   */
  private async activateSubscriptionFromPayment(
    trx: Parameters<Parameters<typeof this.prisma.client.$transaction>[0]>[0],
    tenantId: string,
    transactionId: string,
    amountCfa: number
  ): Promise<void> {
    // Derive durationMonths from the paid amount by matching against pricing.
    const pricing = await this.prisma.client.subscriptionPricing.findFirst({
      where: { priceCfa: amountCfa, active: true }
    });
    const durationMonths = pricing?.durationMonths ?? 1;

    // Capture current platform commission as frozen rate.
    const commissionSetting = await this.prisma.client.platformSetting.findUnique({
      where: { key: COMMISSION_BPS_KEY }
    });
    const frozenCommissionBps = parseIntSetting(commissionSetting?.value, 0);

    // Résoudre le Plan correspondant au montant (Starter, Pro, Enterprise).
    // On cherche un plan dont le prix correspond au montant payé.
    // Si on ne trouve pas, on utilise le plan Free par défaut (rétrocompatibilité).
    const matchingPlan = await this.prisma.client.plan.findFirst({
      where: { priceCfa: amountCfa, isActive: true }
    });

    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    await (trx as any).accountSubscription.create({
      data: {
        tenantId,
        planType: AccountPlanType.STANDARD,
        planId: matchingPlan?.id ?? null,
        status: AccountPlanStatus.ACTIVE,
        startsAt,
        expiresAt,
        durationMonths,
        priceCfa: amountCfa,
        frozenCommissionBps: matchingPlan?.commissionRate ?? frozenCommissionBps,
        paymentTransactionId: transactionId
      }
    });
  }
}
