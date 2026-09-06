import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { assertCommissionBpsAllowed } from "./commission-guardrails";

@Injectable()
export class CommissionOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  async setEventCommission(user: AuthUser, eventId: string, bps: number) {
    assertCommissionBpsAllowed(user, bps);
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { id: true, tenantId: true, status: true, commissionBps: true }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        "Le taux de commission d'un event déjà activé est gelé — impossible de le modifier."
      );
    }

    const oldBps = event.commissionBps;
    await this.prisma.client.$transaction([
      this.prisma.client.event.update({
        where: { id: event.id },
        data: { commissionBps: bps }
      }),
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
    return { eventId: event.id, commissionBps: bps };
  }

  async setTenantCommission(user: AuthUser, tenantId: string, bps: number) {
    assertCommissionBpsAllowed(user, bps);
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, commissionBps: true }
    });
    if (!tenant) throw new NotFoundException("Organisateur introuvable.");

    const oldBps = tenant.commissionBps;
    await this.prisma.client.$transaction([
      this.prisma.client.tenant.update({
        where: { id: tenant.id },
        data: { commissionBps: bps }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "commission.override_tenant",
          targetType: "Tenant",
          targetId: tenant.id,
          metadata: { oldBps, newBps: bps }
        }
      })
    ]);
    return { tenantId: tenant.id, commissionBps: bps };
  }
}
