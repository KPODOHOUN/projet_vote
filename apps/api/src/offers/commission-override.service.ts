import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, NotificationType } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertCommissionBpsAllowed } from "./commission-guardrails";

const tenantRateSchema = z.object({
  bps: z.number().int(),
  // Date d'entrée en vigueur ; absente = immédiatement. Jamais dans le passé :
  // un taux ne s'applique pas rétroactivement.
  effectiveFrom: z.coerce.date().optional(),
  reason: z.string().trim().min(3).max(500)
});

/**
 * Taux négociés par l'administration. Un taux d'organisateur est une ligne
 * d'historique (CommissionRate) : jamais modifiée, jamais rétroactive. Les
 * paiements déjà confirmés gardent la commission enregistrée à leur
 * confirmation ; les concours publiés gardent le taux figé par leur contrat.
 */
@Injectable()
export class CommissionOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  /** Taux d'un concours précis, possible uniquement avant la signature de son contrat. */
  async setEventCommission(user: AuthUser, eventId: string, bps: number) {
    assertCommissionBpsAllowed(user, bps);
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { id: true, tenantId: true, status: true, commissionBps: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException("Ce concours est publié : son taux est figé par le contrat signé.");
    }

    const oldBps = event.commissionBps;
    await this.prisma.client.$transaction([
      this.prisma.client.event.update({ where: { id: event.id }, data: { commissionBps: bps } }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: event.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "commission.override_event",
          targetType: "Event",
          targetId: event.id,
          metadata: { oldBps, newBps: bps }
        }
      })
    ]);
    await this.notifications.create(event.tenantId, NotificationType.COMMISSION_RATE_CHANGED, {
      eventId: event.id,
      bps
    });
    return { eventId: event.id, commissionBps: bps };
  }

  /** Nouveau taux négocié pour un organisateur, à partir d'une date d'effet. */
  async setTenantCommission(user: AuthUser, tenantId: string, payload: unknown) {
    const input = tenantRateSchema.parse(payload);
    assertCommissionBpsAllowed(user, input.bps);
    const now = new Date();
    const effectiveFrom = input.effectiveFrom ?? now;
    if (effectiveFrom.getTime() < now.getTime() - 60_000) {
      throw new ConflictException("La date d'effet ne peut pas être dans le passé : un taux n'est jamais rétroactif.");
    }
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException("Organisateur introuvable.");

    const [rate] = await this.prisma.client.$transaction([
      this.prisma.client.commissionRate.create({
        data: {
          tenantId,
          bps: input.bps,
          effectiveFrom,
          reason: input.reason,
          createdByUserId: user.userId
        }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "commission.tenant_rate_set",
          targetType: "Tenant",
          targetId: tenantId,
          metadata: { bps: input.bps, effectiveFrom: effectiveFrom.toISOString(), reason: input.reason }
        }
      })
    ]);
    await this.notifications.create(tenantId, NotificationType.COMMISSION_RATE_CHANGED, {
      bps: input.bps,
      effectiveFrom: effectiveFrom.toISOString()
    });
    return rate;
  }

  /** Historique complet des taux d'un organisateur (le plus récent d'abord). */
  async listTenantRates(tenantId: string) {
    return this.prisma.client.commissionRate.findMany({
      where: { tenantId },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }]
    });
  }
}
