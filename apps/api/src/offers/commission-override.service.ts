import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

/** Fourchette publique de commission (business plan §5.5). En sortir exige PLATFORM_SUPER_ADMIN. */
const COMMISSION_FLOOR_BPS = 400; // 4%
const COMMISSION_CEILING_BPS = 1_200; // 12%

@Injectable()
export class CommissionOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  private assertBpsAllowed(user: AuthUser, bps: number): void {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      throw new BadRequestException("Le taux de commission doit être un entier entre 0 et 10000 (bps).");
    }
    const outOfRange = bps < COMMISSION_FLOOR_BPS || bps > COMMISSION_CEILING_BPS;
    if (outOfRange && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        `Un taux hors de la fourchette ${COMMISSION_FLOOR_BPS}-${COMMISSION_CEILING_BPS} bps nécessite le rôle super-admin.`
      );
    }
  }

  async setEventCommission(user: AuthUser, eventId: string, bps: number) {
    this.assertBpsAllowed(user, bps);
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
    this.assertBpsAllowed(user, bps);
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
