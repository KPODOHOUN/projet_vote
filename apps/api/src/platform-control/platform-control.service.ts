import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { LedgerDirection, PaymentPurpose, PaymentStatus, UserRole, WalletLedgerKind } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "./vault.service";
import { WalletService } from "../offers/wallet.service";

const cancelVoteSchema = z.object({
  reason: z.string().min(3).max(500)
});

const listVotesQuerySchema = z.object({
  eventId: z.string().min(1).optional(),
  includeCancelled: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

/**
 * Platform-admin "god-mode" control space. Every method is reachable only
 * behind a PLATFORM_ADMIN role guard (enforced by the controller) and writes
 * an immutable audit log. Acts cross-tenant by design.
 */
@Injectable()
export class PlatformControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly wallet: WalletService
  ) {}

  async cancelVote(user: AuthUser, voteId: string, payload: unknown) {
    const input = cancelVoteSchema.parse(payload);
    return this.voidVote(user, voteId, input.reason);
  }

  /** Ancienne « suppression » : désormais la même annulation tracée, avec un motif par défaut. */
  async deleteVote(user: AuthUser, voteId: string) {
    return this.voidVote(user, voteId, "Annulé par l'administration de la plateforme.");
  }

  /**
   * Annulation d'un vote par la plateforme — jamais silencieuse, jamais destructrice :
   * le vote est marqué annulé (il sort du classement), son paiement passe VOIDED
   * (la trace de l'encaissement reste), le portefeuille de l'organisateur est
   * débité de ce qui lui avait été crédité, et une trace d'audit protégée est
   * écrite. Un vote payé ne s'annule que par un super-admin, et seulement si
   * l'organisateur n'a pas déjà retiré cet argent.
   */
  private async voidVote(user: AuthUser, voteId: string, reason: string) {
    const vote = await this.prisma.client.vote.findUnique({ where: { id: voteId } });
    if (!vote) throw new NotFoundException("Vote introuvable.");
    if (vote.cancelledAt) throw new ConflictException("Ce vote est déjà annulé.");
    const payment = await this.prisma.client.paymentTransaction.findUnique({ where: { voteId } });
    const paid = payment?.status === PaymentStatus.SUCCEEDED;
    if (paid && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Annuler un vote payé est réservé au super-administrateur.");
    }

    // Copie chiffrée de l'état avant annulation (preuve en cas de litige).
    await this.vault.createEntry({
      kind: "vote_cancelled",
      tenantId: vote.tenantId,
      eventId: vote.eventId,
      originalVoteId: vote.id,
      amountCfa: vote.amountCfa,
      occurredAt: new Date(),
      actorUserId: user.userId,
      snapshot: { reason, vote, payment }
    });

    let reversedCfa = 0;
    await this.prisma.client.$transaction(async (trx) => {
      const claimed = await trx.vote.updateMany({
        where: { id: vote.id, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelledReason: reason, cancelledByUserId: user.userId }
      });
      if (claimed.count === 0) throw new ConflictException("Ce vote est déjà annulé.");

      if (payment && paid) {
        await trx.paymentTransaction.update({ where: { id: payment.id }, data: { status: PaymentStatus.VOIDED } });
        // Reprise de ce que ce paiement avait crédité à l'organisateur (réserve
        // d'abord, puis disponible : une réserve libérée est passée au disponible).
        const credits = await trx.walletLedgerEntry.findMany({
          where: { paymentId: payment.id, direction: LedgerDirection.CREDIT },
          select: { amountCfa: true }
        });
        reversedCfa = credits.reduce((sum, entry) => sum + entry.amountCfa, 0);
        if (reversedCfa > 0) {
          const wallet = await this.wallet.getOrCreateWallet(vote.tenantId, trx);
          const fromHeld = Math.min(wallet.heldCfa, reversedCfa);
          const fromWithdrawable = reversedCfa - fromHeld;
          if (fromWithdrawable > wallet.withdrawableCfa) {
            throw new ConflictException(
              `L'organisateur a déjà retiré cet argent (${reversedCfa} FCFA à reprendre, ${wallet.heldCfa + wallet.withdrawableCfa} FCFA disponibles) : réglez d'abord la situation avec lui.`
            );
          }
          const note = `Vote annulé par la plateforme : ${reason}`;
          if (fromHeld > 0) {
            await this.wallet.debit({ tenantId: vote.tenantId, amountCfa: fromHeld, kind: WalletLedgerKind.ADJUSTMENT, from: "held", eventId: vote.eventId, paymentId: payment.id, note }, trx);
          }
          if (fromWithdrawable > 0) {
            await this.wallet.debit({ tenantId: vote.tenantId, amountCfa: fromWithdrawable, kind: WalletLedgerKind.ADJUSTMENT, from: "withdrawable", eventId: vote.eventId, paymentId: payment.id, note }, trx);
          }
        }
      } else if (payment && payment.status === PaymentStatus.PENDING) {
        await trx.paymentTransaction.update({ where: { id: payment.id }, data: { status: PaymentStatus.VOIDED } });
      }

      await trx.auditLog.create({
        data: {
          tenantId: vote.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "vote.cancelled",
          targetType: "Vote",
          targetId: vote.id,
          metadata: {
            reason,
            eventId: vote.eventId,
            votesCount: vote.votesCount,
            amountCfa: vote.amountCfa,
            paymentId: payment?.id ?? null,
            paid,
            reversedFromOrganizerCfa: reversedCfa,
            // Le votant a payé : son remboursement se fait hors plateforme.
            refundDueToVoterCfa: paid ? vote.amountCfa : 0
          }
        }
      });
    });

    return { voteId, cancelled: true, paymentVoided: Boolean(payment && payment.status !== PaymentStatus.FAILED), reversedFromOrganizerCfa: reversedCfa };
  }

  async listVotes(query: unknown) {
    const q = listVotesQuerySchema.parse(query);
    const where = {
      ...(q.eventId ? { eventId: q.eventId } : {}),
      ...(q.includeCancelled ? {} : { cancelledAt: null })
    };
    const items = await this.prisma.client.vote.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tenantId: true,
        eventId: true,
        candidateId: true,
        amountCfa: true,
        createdAt: true,
        cancelledAt: true,
        cancelledReason: true,
        event: { select: { title: true } },
        candidate: { select: { fullName: true, number: true } }
      }
    });
    const hasMore = items.length > q.limit;
    const pageItems = hasMore ? items.slice(0, q.limit) : items;
    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null
    };
  }

  async getOverview() {
    const [tenants, events, activeVotes, cancelledVotes, revenue, commission, voided] =
      await Promise.all([
        this.prisma.client.tenant.count(),
        this.prisma.client.event.count(),
        // Active votes = PAID votes only (SUCCEEDED VOTE payment with a voteId).
        this.prisma.client.paymentTransaction.count({
          where: {
            status: PaymentStatus.SUCCEEDED,
            purpose: PaymentPurpose.VOTE,
            voteId: { not: null }
          }
        }),
        // Votes annulés par la plateforme : conservés, marqués annulés.
        this.prisma.client.vote.count({ where: { cancelledAt: { not: null } } }),
        this.prisma.client.paymentTransaction.aggregate({
          _sum: { amountCfa: true },
          where: { status: PaymentStatus.SUCCEEDED }
        }),
        this.prisma.client.paymentTransaction.aggregate({
          _sum: { commissionCfa: true },
          where: { status: PaymentStatus.SUCCEEDED }
        }),
        // Paiements de votes annulés : l'argent est à rembourser aux votants.
        this.prisma.client.paymentTransaction.aggregate({
          _sum: { amountCfa: true },
          where: { status: PaymentStatus.VOIDED, purpose: PaymentPurpose.VOTE }
        })
      ]);
    const grossRevenueCfa = revenue._sum.amountCfa ?? 0;
    const commissionCfa = commission._sum.commissionCfa ?? 0;
    return {
      tenants,
      events,
      votes: { active: activeVotes, cancelled: cancelledVotes },
      grossRevenueCfa,
      commissionCfa,
      refundDueToVotersCfa: voided._sum.amountCfa ?? 0,
      netToOrganizersCfa: grossRevenueCfa - commissionCfa
    };
  }
}
