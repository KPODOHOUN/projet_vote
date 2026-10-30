import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from "@nestjs/common";
import {
  PaymentPurpose,
  PaymentProvider,
  PaymentStatus,
  TicketStatus,
  UserRole,
  WalletLedgerKind
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalletService } from "../offers/wallet.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { PspRegistry } from "./psp/psp.registry";
import { MailService } from "../mail/mail.service";
import { ticketEmailHtml } from "../tickets/ticket-email.util";
import { parseStrictProviderAmount } from "./psp/parse-provider-amount";
import type { FeexpayStatusPayload } from "./feexpay/feexpay.types";

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
    private readonly pspRegistry: PspRegistry,
    private readonly wallet: WalletService,
    private readonly offerSettings: OfferSettingsService,
    // Optionnel : les tests unitaires construisent ce service sans e-mail.
    @Optional() private readonly mail?: MailService
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
    await this.applySuccess(tx, "system:payment:verify", { providerRef: reference });
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

  /** Mode démo : confirme un paiement PENDING sans pull PSP, avec exactement les mêmes effets. */
  async applyDemoSuccess(transactionId: string): Promise<void> {
    const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.status !== PaymentStatus.PENDING) {
      return;
    }
    await this.applySuccess(tx, "system:payments:demo", { providerRef: tx.providerRef, demo: true });
  }

  /**
   * Seul chemin qui applique un paiement réussi (vérification réelle et mode
   * démo) : passage SUCCEEDED + commission figée, effet métier (voix comptée,
   * billets payés), crédit du portefeuille, audit — dans UNE transaction, avec
   * garde CAS sur PENDING (un second passage ne fait rien : pas de double crédit).
   */
  private async applySuccess(
    tx: { id: string; tenantId: string; eventId: string; amountCfa: number; currency: string; purpose: PaymentPurpose; voteId: string | null },
    actorUserId: string,
    metadata: Record<string, string | boolean | null>
  ): Promise<boolean> {
    const commissionCfa = await this.resolveCommissionForTx(tx);

    let applied = false;
    await this.prisma.client.$transaction(async (trx) => {
      const updated = await trx.paymentTransaction.updateMany({
        where: { id: tx.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.SUCCEEDED, ...(commissionCfa !== null ? { commissionCfa } : {}) }
      });
      if (updated.count === 0) {
        // Un autre passage (webhook rejoué, réconciliation) a déjà appliqué ce paiement.
        return;
      }
      applied = true;

      if ((tx.purpose === PaymentPurpose.VOTE || tx.purpose === PaymentPurpose.ORGANIZER_VOTE_TOPUP) && tx.voteId) {
        await trx.vote.update({ where: { id: tx.voteId }, data: { paidAt: new Date() } });
      } else if (tx.purpose === PaymentPurpose.TICKET) {
        // Seulement les billets de CET achat : un paiement ne valide jamais les
        // réservations d'un autre acheteur du même événement.
        await trx.ticket.updateMany({
          where: { paymentTransactionId: tx.id, status: TicketStatus.RESERVED },
          data: { status: TicketStatus.PAID, paidAt: new Date(), confirmedAt: new Date() }
        });
      }

      await this.applyOfferWalletEffects(trx, { ...tx, commissionCfa });

      await trx.auditLog.create({
        data: {
          tenantId: tx.tenantId,
          actorUserId,
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.verified_applied",
          targetType: "PaymentTransaction",
          targetId: tx.id,
          metadata: {
            ...metadata,
            amountCfa: tx.amountCfa,
            currency: tx.currency,
            purpose: tx.purpose,
            ...(commissionCfa !== null ? { commissionCfa } : {})
          }
        }
      });
    });

    if (applied && tx.purpose === PaymentPurpose.TICKET) {
      void this.sendTicketEmails(tx.id);
    }
    if (applied && (tx.purpose === PaymentPurpose.VOTE || tx.purpose === PaymentPurpose.ORGANIZER_VOTE_TOPUP)) {
      this.notifyPaymentSucceeded(tx.tenantId, tx.eventId, tx.amountCfa);
    }
    return applied;
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
    // SHADOMA encaisse tous les paiements sur son propre compte prestataire.
    const creds = await this.pspRegistry.resolvePlatformCredentials(tx.provider);
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

  /** Envoie chaque billet payé de cet achat à son détenteur (une fois, après confirmation). */
  private async sendTicketEmails(transactionId: string): Promise<void> {
    if (!this.mail) return;
    try {
      const tickets = await this.prisma.client.ticket.findMany({
        where: { paymentTransactionId: transactionId, status: TicketStatus.PAID },
        include: { ticketType: { select: { name: true } }, event: { select: { title: true, slug: true } } }
      });
      for (const ticket of tickets) {
        if (!ticket.holderEmail) continue;
        this.mail.send({
          to: [ticket.holderEmail],
          subject: `Votre billet pour ${ticket.event.title}`,
          html: ticketEmailHtml({
            id: ticket.id,
            qrSecret: ticket.qrSecret,
            amountCfa: ticket.amountCfa,
            holderName: ticket.holderName,
            holderPhone: ticket.holderPhone,
            holderEmail: ticket.holderEmail,
            ticketType: ticket.ticketType,
            event: ticket.event
          })
        });
      }
    } catch (error) {
      this.logger.error(
        `Envoi des billets impossible (transaction ${transactionId})`,
        error instanceof Error ? error.message : error
      );
    }
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
      // Paiement de billets échoué : la réservation libère le stock.
      await trx.ticket.updateMany({
        where: { paymentTransactionId: txId, status: TicketStatus.RESERVED },
        data: { status: TicketStatus.CANCELLED }
      });
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

  /**
   * Commission figée sur le paiement à sa confirmation (règles centralisées
   * dans OfferSettingsService). Votes, billets et votes ajoutés par
   * l'organisateur suivent la même règle ; les anciens objets de paiement
   * (activation, abonnement) n'en ont pas.
   */
  private async resolveCommissionForTx(tx: { purpose: PaymentPurpose; eventId: string; amountCfa: number }): Promise<number | null> {
    if (!MONEY_PURPOSES.has(tx.purpose)) return null;
    const bps = await this.offerSettings.resolveCommissionBps(tx.eventId);
    return this.offerSettings.computeCommissionCfa(tx.amountCfa, bps);
  }

  /**
   * Crédit du portefeuille de l'organisateur : net = brut − commission, partagé
   * entre réserve (heldBps figé par le contrat) et disponible. Le type
   * d'écriture dit d'où vient l'argent (vote, billet, votes ajoutés).
   */
  private async applyOfferWalletEffects(
    trx: Parameters<Parameters<typeof this.prisma.client.$transaction>[0]>[0],
    tx: { id: string; tenantId: string; eventId: string; amountCfa: number; purpose: PaymentPurpose; commissionCfa: number | null }
  ): Promise<void> {
    if (!MONEY_PURPOSES.has(tx.purpose)) return;
    const net = tx.amountCfa - (tx.commissionCfa ?? 0);
    if (net <= 0) return;
    const event = await trx.event.findUnique({ where: { id: tx.eventId }, select: { heldBps: true } });
    const heldBps = event?.heldBps ?? (await this.offerSettings.getSettings()).heldBps;
    await this.wallet.creditSplit(
      {
        tenantId: tx.tenantId,
        netCfa: net,
        heldBps,
        kind: LEDGER_KIND_BY_PURPOSE[tx.purpose] ?? WalletLedgerKind.VOTE_CREDIT,
        eventId: tx.eventId,
        paymentId: tx.id,
        note: LEDGER_NOTE_BY_PURPOSE[tx.purpose] ?? null
      },
      trx
    );
  }
}

const MONEY_PURPOSES: ReadonlySet<PaymentPurpose> = new Set([
  PaymentPurpose.VOTE,
  PaymentPurpose.TICKET,
  PaymentPurpose.ORGANIZER_VOTE_TOPUP
]);

const LEDGER_KIND_BY_PURPOSE: Partial<Record<PaymentPurpose, WalletLedgerKind>> = {
  [PaymentPurpose.VOTE]: WalletLedgerKind.VOTE_CREDIT,
  [PaymentPurpose.TICKET]: WalletLedgerKind.TICKET_CREDIT,
  [PaymentPurpose.ORGANIZER_VOTE_TOPUP]: WalletLedgerKind.TOPUP_CREDIT
};

const LEDGER_NOTE_BY_PURPOSE: Partial<Record<PaymentPurpose, string>> = {
  [PaymentPurpose.VOTE]: "Votes",
  [PaymentPurpose.TICKET]: "Billets",
  [PaymentPurpose.ORGANIZER_VOTE_TOPUP]: "Votes ajoutés par l'organisateur"
};
