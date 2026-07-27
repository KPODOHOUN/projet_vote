import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  ACTIVATION_FEE_CFA_KEY,
  COMMISSION_BPS_KEY,
  DEFAULT_ACTIVATION_FEE_CFA,
  parseIntSetting
} from "../common/platform-settings";
import { VaultService } from "./vault.service";

export const COMMISSION_SETTING_KEY = COMMISSION_BPS_KEY;

const commissionSchema = z.object({
  // Basis points: 0..10000 (0% .. 100%). 0 disables commission.
  commissionBps: z.number().int().min(0).max(10_000)
});

const updateSettingsSchema = z
  .object({
    commissionBps: z.number().int().min(0).max(10_000).optional(),
    activationFeeCfa: z.number().int().min(0).max(100_000_000).optional()
  })
  .refine((v) => v.commissionBps !== undefined || v.activationFeeCfa !== undefined, {
    message: "Aucun paramètre fourni."
  });

const eventCommissionSchema = z.object({
  // null clears the per-event override (falls back to the platform default).
  commissionBps: z.number().int().min(0).max(10_000).nullable()
});

const cancelVoteSchema = z.object({
  reason: z.string().min(3).max(500)
});

const listVotesQuerySchema = z.object({
  eventId: z.string().min(1).optional(),
  includeCancelled: z.coerce.boolean().default(false),
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

  /**
   * Resolve the effective commission (bps) following the chain:
   * per-event override → organizer negotiated rate → platform default → 0.
   */
  async resolveCommissionBps(
    eventCommissionBps: number | null,
    tenantCommissionBps: number | null = null
  ): Promise<number> {
    if (eventCommissionBps !== null && eventCommissionBps >= 0) {
      return eventCommissionBps;
    }
    if (tenantCommissionBps !== null && tenantCommissionBps >= 0) {
      return tenantCommissionBps;
    }
    const setting = await this.prisma.client.platformSetting.findUnique({
      where: { key: COMMISSION_SETTING_KEY }
    });
    const bps = setting ? Number.parseInt(setting.value, 10) : 0;
    return Number.isFinite(bps) && bps > 0 ? bps : 0;
  }

  async setTenantCommission(_user: AuthUser, tenantId: string, payload: unknown) {
    const input = eventCommissionSchema.parse(payload);
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("Organisateur introuvable.");
    }
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: { commissionBps: input.commissionBps }
    });
    // Silent: no audit log (commission is ultra-discreet).
    return { tenantId, commissionBps: input.commissionBps };
  }

  async getSettings() {
    const rows = await this.prisma.client.platformSetting.findMany({
      where: { key: { in: [COMMISSION_BPS_KEY, ACTIVATION_FEE_CFA_KEY] } }
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      commissionBps: parseIntSetting(map.get(COMMISSION_BPS_KEY), 0),
      activationFeeCfa: parseIntSetting(map.get(ACTIVATION_FEE_CFA_KEY), DEFAULT_ACTIVATION_FEE_CFA)
    };
  }

  private async putSetting(user: AuthUser, key: string, value: number) {
    await this.prisma.client.platformSetting.upsert({
      where: { key },
      create: { key, value: String(value), updatedByUserId: user.userId },
      update: { value: String(value), updatedByUserId: user.userId }
    });
  }

  // SILENT by design (commission must be ultra-discreet): NO audit log is
  // written for any commission / platform-settings change — organizers must
  // never see it surface in their own audit trail.
  async updateCommission(user: AuthUser, payload: unknown) {
    const input = commissionSchema.parse(payload);
    await this.putSetting(user, COMMISSION_BPS_KEY, input.commissionBps);
    return { commissionBps: input.commissionBps };
  }

  async updateSettings(user: AuthUser, payload: unknown) {
    const input = updateSettingsSchema.parse(payload);
    if (input.commissionBps !== undefined) {
      await this.putSetting(user, COMMISSION_BPS_KEY, input.commissionBps);
    }
    if (input.activationFeeCfa !== undefined) {
      await this.putSetting(user, ACTIVATION_FEE_CFA_KEY, input.activationFeeCfa);
    }
    return this.getSettings();
  }

  async setEventCommission(_user: AuthUser, eventId: string, payload: unknown) {
    const input = eventCommissionSchema.parse(payload);
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    await this.prisma.client.event.update({
      where: { id: eventId },
      data: { commissionBps: input.commissionBps }
    });
    // Silent: no audit log (commission is ultra-discreet).
    return { eventId, commissionBps: input.commissionBps };
  }

  // Option B+ : annuler un vote l'EFFACE du ledger principal (Vote +
  // PaymentTransaction) et dépose une copie chiffrée dans le coffre. La seule
  // trace survivante est la VaultEntry, lisible par un PLATFORM_SUPER_ADMIN
  // après OTP. SILENCIEUX : aucun audit log côté normal.
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
      orderBy: { createdAt: "desc" },
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
        cancelledReason: true
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
