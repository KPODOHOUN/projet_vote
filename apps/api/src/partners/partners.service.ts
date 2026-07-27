import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ActivationDebtStatus,
  PartnerRequestStatus,
  PaymentPurpose,
  PaymentStatus,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import {
  ACTIVATION_FEE_CFA_KEY,
  DEFAULT_ACTIVATION_FEE_CFA,
  parseIntSetting
} from "../common/platform-settings";
import { resolveTierForRevenue as resolveTierForRevenueUtil } from "./partner-tier.util";
import { PartnerNotificationsService } from "./partner-notifications.service";

const requestSchema = z.object({
  eventId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(20, "Expliquez pourquoi vous choisissez la formule partenaire (20 caractères minimum).")
    .max(500),
  estimatedRevenueCfa: z
    .number()
    .int()
    .min(1, "Indiquez vos recettes prévues pour appliquer la bonne commission.")
    .max(500_000_000),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: "Vous devez accepter les conditions de la formule partenaire."
    })
  })
});

const decisionSchema = z.object({
  reason: z.string().min(3).max(500).optional()
});

const approveSchema = z.object({
  offerTierId: z.string().min(1).optional(),
  platformShareBps: z.number().int().min(0).max(10_000).optional(),
  estimatedRevenueCfa: z.number().int().min(0).max(500_000_000).optional()
});

const tierSchema = z.object({
  label: z.string().min(2).max(80),
  minRevenueCfa: z.number().int().min(0),
  maxRevenueCfa: z.number().int().min(0).nullable().optional(),
  platformShareBps: z.number().int().min(0).max(10_000),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional()
});

const tierUpdateSchema = tierSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "Aucun champ fourni."
});

export type PartnerEventFinancials = {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  tenantId: string;
  tenantName: string;
  isPartnerEvent: boolean;
  status: string;
  estimatedRevenueCfa: number | null;
  partnerPlatformShareBps: number | null;
  offerTierLabel: string | null;
  votesGrossCfa: number;
  platformCommissionCfa: number;
  platformSharePercent: number;
  activationDebtCfa: number;
  activationRecoveredCfa: number;
  activationRemainingCfa: number;
  organizerGrossCfa: number;
  organizerNetPayableCfa: number;
  voteCount: number;
};

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerNotifications: PartnerNotificationsService
  ) {}

  async isPartnerEvent(eventId: string): Promise<boolean> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { isPartnerEvent: true }
    });
    return event?.isPartnerEvent ?? false;
  }

  async listOfferTiers(activeOnly = false) {
    const rows = await this.prisma.client.partnerOfferTier.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { sortOrder: "asc" }
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      minRevenueCfa: row.minRevenueCfa,
      maxRevenueCfa: row.maxRevenueCfa,
      platformShareBps: row.platformShareBps,
      platformSharePercent: row.platformShareBps / 100,
      sortOrder: row.sortOrder,
      active: row.active
    }));
  }

  async createOfferTier(admin: AuthUser, payload: unknown) {
    this.assertPlatformAdmin(admin);
    const input = tierSchema.parse(payload);
    if (input.maxRevenueCfa != null && input.maxRevenueCfa < input.minRevenueCfa) {
      throw new BadRequestException("maxRevenueCfa doit être ≥ minRevenueCfa.");
    }
    const row = await this.prisma.client.partnerOfferTier.create({
      data: {
        label: input.label,
        minRevenueCfa: input.minRevenueCfa,
        maxRevenueCfa: input.maxRevenueCfa ?? null,
        platformShareBps: input.platformShareBps,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true
      }
    });
    return { id: row.id, label: row.label };
  }

  async updateOfferTier(admin: AuthUser, tierId: string, payload: unknown) {
    this.assertPlatformAdmin(admin);
    const input = tierUpdateSchema.parse(payload);
    const existing = await this.prisma.client.partnerOfferTier.findUnique({ where: { id: tierId } });
    if (!existing) throw new NotFoundException("Palier introuvable.");
    const min = input.minRevenueCfa ?? existing.minRevenueCfa;
    const max = input.maxRevenueCfa !== undefined ? input.maxRevenueCfa : existing.maxRevenueCfa;
    if (max != null && max < min) {
      throw new BadRequestException("maxRevenueCfa doit être ≥ minRevenueCfa.");
    }
    await this.prisma.client.partnerOfferTier.update({
      where: { id: tierId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.minRevenueCfa !== undefined ? { minRevenueCfa: input.minRevenueCfa } : {}),
        ...(input.maxRevenueCfa !== undefined ? { maxRevenueCfa: input.maxRevenueCfa } : {}),
        ...(input.platformShareBps !== undefined ? { platformShareBps: input.platformShareBps } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {})
      }
    });
    return { id: tierId, updated: true };
  }

  async deleteOfferTier(admin: AuthUser, tierId: string) {
    this.assertPlatformAdmin(admin);
    const used = await this.prisma.client.event.count({
      where: { partnerOfferTierId: tierId }
    });
    if (used > 0) {
      throw new ConflictException("Ce palier est utilisé par des évènements — désactivez-le plutôt.");
    }
    await this.prisma.client.partnerOfferTier.delete({ where: { id: tierId } });
    return { deleted: true };
  }

  async resolveTierForRevenue(estimatedRevenueCfa: number) {
    return resolveTierForRevenueUtil(this.prisma.client, estimatedRevenueCfa);
  }

  async requestPartnership(user: AuthUser, payload: unknown) {
    if (user.role !== UserRole.ORGANIZER_OWNER && user.role !== UserRole.ORGANIZER_STAFF) {
      throw new ForbiddenException("Seul un organisateur peut demander une offre partenaire.");
    }
    const input = requestSchema.parse(payload);
    const event = await this.prisma.client.event.findFirst({
      where: { id: input.eventId, tenantId: user.tenantId },
      select: { id: true, title: true, activationPaidAt: true }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (event.activationPaidAt) {
      throw new ConflictException("Cet évènement est déjà activé.");
    }
    let offerTierId: string | undefined;
    if (input.estimatedRevenueCfa != null) {
      const tier = await this.resolveTierForRevenue(input.estimatedRevenueCfa);
      offerTierId = tier?.id;
    }
    try {
      const created = await this.prisma.client.partnerRequest.create({
        data: {
          tenantId: user.tenantId,
          eventId: input.eventId,
          requestedByUserId: user.userId,
          reason: input.reason,
          estimatedRevenueCfa: input.estimatedRevenueCfa,
          ...(offerTierId ? { offerTierId } : {})
        }
      });
      const suggestedTier = offerTierId
        ? await this.prisma.client.partnerOfferTier.findUnique({ where: { id: offerTierId } })
        : null;
      const tenant = await this.prisma.client.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { displayName: true }
      });
      this.partnerNotifications.notifyRequestCreated({
        requestId: created.id,
        eventId: created.eventId,
        eventTitle: event.title,
        tenantId: user.tenantId,
        tenantName: tenant.displayName,
        reason: input.reason,
        estimatedRevenueCfa: input.estimatedRevenueCfa,
        requesterEmail: user.email
      });
      return {
        id: created.id,
        eventId: created.eventId,
        status: created.status,
        estimatedRevenueCfa: created.estimatedRevenueCfa,
        suggestedTier: suggestedTier
          ? {
              id: suggestedTier.id,
              label: suggestedTier.label,
              platformShareBps: suggestedTier.platformShareBps
            }
          : null,
        createdAt: created.createdAt.toISOString()
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Une demande existe déjà pour cet évènement.");
      }
      throw error;
    }
  }

  async getEventPartnerStatus(user: AuthUser, eventId: string) {
    const isAdmin =
      user.role === UserRole.PLATFORM_ADMIN || user.role === UserRole.PLATFORM_SUPER_ADMIN;
    const event = await this.prisma.client.event.findFirst({
      where: isAdmin ? { id: eventId } : { id: eventId, tenantId: user.tenantId },
      select: {
        id: true,
        activationPaidAt: true,
        isPartnerEvent: true,
        partnerPlatformShareBps: true,
        estimatedRevenueCfa: true
      }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    const request = await this.prisma.client.partnerRequest.findUnique({
      where: { eventId },
      include: { offerTier: { select: { label: true, platformShareBps: true } } }
    });
    const debt = await this.prisma.client.activationDebt.findUnique({
      where: { eventId },
      select: { amountCfa: true, recoveredCfa: true, status: true }
    });
    return {
      eventId,
      isPartnerEvent: event.isPartnerEvent,
      activationPaidAt: event.activationPaidAt?.toISOString() ?? null,
      partnerPlatformShareBps: event.partnerPlatformShareBps,
      partnerPlatformSharePercent:
        event.partnerPlatformShareBps != null ? event.partnerPlatformShareBps / 100 : null,
      estimatedRevenueCfa: event.estimatedRevenueCfa,
      usesPlatformPaymentAccount: event.isPartnerEvent,
      request: request
        ? {
            id: request.id,
            status: request.status,
            reason: request.reason,
            estimatedRevenueCfa: request.estimatedRevenueCfa,
            createdAt: request.createdAt.toISOString(),
            decidedAt: request.decidedAt?.toISOString() ?? null,
            suggestedTier: request.offerTier
              ? {
                  label: request.offerTier.label,
                  platformShareBps: request.offerTier.platformShareBps
                }
              : null
          }
        : null,
      debt: debt
        ? {
            amountCfa: debt.amountCfa,
            recoveredCfa: debt.recoveredCfa,
            remainingCfa: debt.amountCfa - debt.recoveredCfa,
            status: debt.status
          }
        : null
    };
  }

  async approveRequest(admin: AuthUser, requestId: string, payload: unknown) {
    this.assertPlatformAdmin(admin);
    const input = approveSchema.parse(payload ?? {});
    const req = await this.prisma.client.partnerRequest.findUnique({
      where: { id: requestId },
      include: {
        event: { select: { title: true } },
        tenant: { select: { displayName: true } },
        offerTier: true
      }
    });
    if (!req) throw new NotFoundException("Demande introuvable.");
    if (req.status !== PartnerRequestStatus.PENDING) {
      throw new BadRequestException("Demande déjà traitée.");
    }
    const fee = await this.readActivationFee();
    if (fee <= 0) {
      throw new BadRequestException("Aucun forfait d'activation configuré.");
    }

    const estimated =
      input.estimatedRevenueCfa ?? req.estimatedRevenueCfa ?? null;
    let shareBps = input.platformShareBps ?? null;
    let tierId = input.offerTierId ?? req.offerTierId ?? null;

    if (shareBps == null && tierId) {
      const tier = await this.prisma.client.partnerOfferTier.findUnique({
        where: { id: tierId }
      });
      if (!tier) throw new NotFoundException("Palier introuvable.");
      shareBps = tier.platformShareBps;
    }
    if (shareBps == null && estimated != null) {
      const tier = await this.resolveTierForRevenue(estimated);
      if (tier) {
        shareBps = tier.platformShareBps;
        tierId = tier.id;
      }
    }
    if (shareBps == null) {
      throw new BadRequestException(
        "Indiquez un palier, un pourcentage plateforme ou un CA estimé couvert par la grille."
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.tenant.update({
        where: { id: req.tenantId },
        data: { isPartner: true }
      }),
      this.prisma.client.event.update({
        where: { id: req.eventId },
        data: {
          isPartnerEvent: true,
          partnerPlatformShareBps: shareBps,
          partnerOfferTierId: tierId,
          ...(estimated != null ? { estimatedRevenueCfa: estimated } : {}),
          activationPaidAt: new Date(),
          status: "ACTIVE"
        }
      }),
      this.prisma.client.activationDebt.create({
        data: {
          tenantId: req.tenantId,
          eventId: req.eventId,
          amountCfa: fee,
          recoveredCfa: 0
        }
      }),
      this.prisma.client.partnerRequest.update({
        where: { id: requestId },
        data: {
          status: PartnerRequestStatus.APPROVED,
          decidedByUserId: admin.userId,
          decidedAt: new Date()
        }
      })
    ]);

    this.partnerNotifications.notifyRequestApproved(req.tenantId, req.eventId, req.event.title);

    return {
      approved: true,
      requestId,
      eventId: req.eventId,
      activationFeeCfa: fee,
      platformShareBps: shareBps,
      platformSharePercent: shareBps / 100,
      estimatedRevenueCfa: estimated,
      eventTitle: req.event.title,
      tenantName: req.tenant.displayName
    };
  }

  async rejectRequest(admin: AuthUser, requestId: string, payload: unknown) {
    this.assertPlatformAdmin(admin);
    const input = decisionSchema.parse(payload);
    const req = await this.prisma.client.partnerRequest.findUnique({
      where: { id: requestId },
      include: { event: { select: { title: true } } }
    });
    if (!req) throw new NotFoundException("Demande introuvable.");
    if (req.status !== PartnerRequestStatus.PENDING) {
      throw new BadRequestException("Demande déjà traitée.");
    }
    await this.prisma.client.partnerRequest.update({
      where: { id: requestId },
      data: {
        status: PartnerRequestStatus.REJECTED,
        decidedByUserId: admin.userId,
        decidedAt: new Date(),
        ...(input.reason ? { reason: input.reason } : {})
      }
    });
    this.partnerNotifications.notifyRequestRejected(req.tenantId, req.eventId, req.event.title);
    return { rejected: true, requestId };
  }

  async countPendingRequests(): Promise<number> {
    return this.prisma.client.partnerRequest.count({
      where: { status: PartnerRequestStatus.PENDING }
    });
  }

  async hasOutstandingDebt(tenantId: string): Promise<boolean> {
    const count = await this.prisma.client.activationDebt.count({
      where: { tenantId, status: ActivationDebtStatus.OUTSTANDING }
    });
    return count > 0;
  }

  async listPartnerEventsFinancials(): Promise<PartnerEventFinancials[]> {
    const events = await this.prisma.client.event.findMany({
      where: { isPartnerEvent: true },
      orderBy: { createdAt: "desc" },
      include: {
        tenant: { select: { displayName: true } },
        partnerOfferTier: { select: { label: true } },
        activationDebt: true
      }
    });
    const results: PartnerEventFinancials[] = [];
    for (const event of events) {
      results.push(await this.buildEventFinancials(event));
    }
    return results;
  }

  async getPartnerEventFinancials(eventId: string): Promise<PartnerEventFinancials> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: {
        tenant: { select: { displayName: true } },
        partnerOfferTier: { select: { label: true } },
        activationDebt: true
      }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (!event.isPartnerEvent) {
      throw new BadRequestException("Cet évènement n'est pas en offre partenaire.");
    }
    return this.buildEventFinancials(event);
  }

  async listRequests(query: unknown) {
    const q = z
      .object({
        status: z.nativeEnum(PartnerRequestStatus).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse(query);
    const rows = await this.prisma.client.partnerRequest.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: "desc" },
      take: q.limit,
      include: {
        tenant: { select: { displayName: true, slug: true } },
        event: { select: { title: true, slug: true } },
        offerTier: { select: { id: true, label: true, platformShareBps: true } }
      }
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      eventId: row.eventId,
      status: row.status,
      reason: row.reason,
      estimatedRevenueCfa: row.estimatedRevenueCfa,
      offerTier: row.offerTier,
      requestedByUserId: row.requestedByUserId,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      tenantName: row.tenant.displayName,
      tenantSlug: row.tenant.slug,
      eventTitle: row.event.title,
      eventSlug: row.event.slug
    }));
  }

  async listDebts(tenantId?: string) {
    const rows = await this.prisma.client.activationDebt.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: "desc" },
      include: {
        tenant: { select: { displayName: true, slug: true } },
        event: { select: { title: true, slug: true, isPartnerEvent: true } }
      }
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      eventId: row.eventId,
      amountCfa: row.amountCfa,
      recoveredCfa: row.recoveredCfa,
      remainingCfa: row.amountCfa - row.recoveredCfa,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      tenantName: row.tenant.displayName,
      eventTitle: row.event.title,
      isPartnerEvent: row.event.isPartnerEvent
    }));
  }

  private async buildEventFinancials(event: {
    id: string;
    title: string;
    slug: string;
    tenantId: string;
    status: string;
    isPartnerEvent: boolean;
    partnerPlatformShareBps: number | null;
    estimatedRevenueCfa: number | null;
    tenant: { displayName: string };
    partnerOfferTier: { label: string } | null;
    activationDebt: {
      amountCfa: number;
      recoveredCfa: number;
    } | null;
  }): Promise<PartnerEventFinancials> {
    const payments = await this.prisma.client.paymentTransaction.findMany({
      where: {
        eventId: event.id,
        purpose: PaymentPurpose.VOTE,
        status: PaymentStatus.SUCCEEDED
      },
      select: { amountCfa: true, commissionCfa: true }
    });
    const votesGrossCfa = payments.reduce((acc, p) => acc + p.amountCfa, 0);
    const platformCommissionCfa = payments.reduce(
      (acc, p) => acc + (p.commissionCfa ?? 0),
      0
    );
    const debt = event.activationDebt;
    const activationDebtCfa = debt?.amountCfa ?? 0;
    const activationRecoveredCfa = debt?.recoveredCfa ?? 0;
    const activationRemainingCfa = Math.max(0, activationDebtCfa - activationRecoveredCfa);
    const organizerGrossCfa = votesGrossCfa - platformCommissionCfa;
    const organizerNetPayableCfa = Math.max(0, organizerGrossCfa - activationRemainingCfa);
    const bps = event.partnerPlatformShareBps ?? 0;

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventSlug: event.slug,
      tenantId: event.tenantId,
      tenantName: event.tenant.displayName,
      isPartnerEvent: event.isPartnerEvent,
      status: event.status,
      estimatedRevenueCfa: event.estimatedRevenueCfa,
      partnerPlatformShareBps: event.partnerPlatformShareBps,
      offerTierLabel: event.partnerOfferTier?.label ?? null,
      votesGrossCfa,
      platformCommissionCfa,
      platformSharePercent: bps / 100,
      activationDebtCfa,
      activationRecoveredCfa,
      activationRemainingCfa,
      organizerGrossCfa,
      organizerNetPayableCfa,
      voteCount: payments.length
    };
  }

  private assertPlatformAdmin(user: AuthUser) {
    if (user.role !== UserRole.PLATFORM_ADMIN && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Action réservée à la plateforme.");
    }
  }

  private async readActivationFee(): Promise<number> {
    const row = await this.prisma.client.platformSetting.findUnique({
      where: { key: ACTIVATION_FEE_CFA_KEY }
    });
    return parseIntSetting(row?.value, DEFAULT_ACTIVATION_FEE_CFA);
  }
}
