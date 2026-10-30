import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "./vault.service";

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
    private readonly vault: VaultService
  ) {}

  async cancelVote(user: AuthUser, voteId: string, payload: unknown) {
    const input = cancelVoteSchema.parse(payload);
    const vote = await this.prisma.client.vote.findUnique({ where: { id: voteId } });
    if (!vote) {
      throw new NotFoundException("Vote introuvable.");
    }
    const payment = await this.prisma.client.paymentTransaction.findUnique({
      where: { voteId }
    });
    // 1. Coffrer (chiffré) AVANT toute suppression — si ça échoue, rien n'est perdu.
    await this.vault.createEntry({
      kind: "vote_cancelled",
      tenantId: vote.tenantId,
      eventId: vote.eventId,
      originalVoteId: vote.id,
      amountCfa: vote.amountCfa,
      occurredAt: new Date(),
      actorUserId: user.userId,
      snapshot: { reason: input.reason, vote, payment }
    });
    // 2. Purger le ledger principal (atomique).
    await this.prisma.client.$transaction([
      ...(payment
        ? [this.prisma.client.paymentTransaction.delete({ where: { id: payment.id } })]
        : []),
      this.prisma.client.vote.delete({ where: { id: voteId } })
    ]);
    return { voteId, cancelled: true, paymentVoided: payment !== null };
  }

  /**
   * Hard-delete a vote — "make it disappear". Same purge-and-vault path as
   * cancelVote but tagged `vote_deleted`. SILENT by design (no audit log).
   */
  async deleteVote(user: AuthUser, voteId: string) {
    const vote = await this.prisma.client.vote.findUnique({ where: { id: voteId } });
    if (!vote) {
      throw new NotFoundException("Vote introuvable.");
    }
    const payment = await this.prisma.client.paymentTransaction.findUnique({
      where: { voteId }
    });
    await this.vault.createEntry({
      kind: "vote_deleted",
      tenantId: vote.tenantId,
      eventId: vote.eventId,
      originalVoteId: vote.id,
      amountCfa: vote.amountCfa,
      occurredAt: new Date(),
      actorUserId: user.userId,
      snapshot: { vote, payment }
    });
    await this.prisma.client.$transaction([
      ...(payment
        ? [this.prisma.client.paymentTransaction.delete({ where: { id: payment.id } })]
        : []),
      this.prisma.client.vote.delete({ where: { id: voteId } })
    ]);
    return { voteId, deleted: true, paymentVoided: payment !== null };
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
    const [tenants, events, activeVotes, cancelledVotes, revenue, commission, confiscated] =
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
        // Cancelled votes no longer exist in the Vote table (Option B+ purges
        // them). Kept at 0 for backward-compatible UIs; the real confiscation
        // figure is surfaced separately below.
        Promise.resolve(0),
        this.prisma.client.paymentTransaction.aggregate({
          _sum: { amountCfa: true },
          where: { status: PaymentStatus.SUCCEEDED }
        }),
        this.prisma.client.paymentTransaction.aggregate({
          _sum: { commissionCfa: true },
          where: { status: PaymentStatus.SUCCEEDED }
        }),
        this.vault.sumConfiscatedAmountCfa()
      ]);
    const grossRevenueCfa = revenue._sum.amountCfa ?? 0;
    const commissionCfa = commission._sum.commissionCfa ?? 0;
    return {
      tenants,
      events,
      votes: { active: activeVotes, cancelled: cancelledVotes },
      grossRevenueCfa,
      commissionCfa,
      confiscatedRevenueCfa: confiscated,
      netToOrganizersCfa: grossRevenueCfa - commissionCfa
    };
  }
}
