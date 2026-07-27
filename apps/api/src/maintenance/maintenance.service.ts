import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { isPlatformOperator } from "../auth/platform-roles";
import {
  DEFAULT_MAINTENANCE_MESSAGE_FR,
  MAINTENANCE_MESSAGE_KEY,
  MAINTENANCE_MODE_KEY
} from "../common/platform-settings";
import { PrismaService } from "../prisma/prisma.service";

const purgeSchema = z.object({
  auditLogsRetentionDays: z.coerce.number().int().min(0).max(3650).default(365),
  idempotencyRetentionDays: z.coerce.number().int().min(1).max(365).default(30),
  revokedSessionsRetentionDays: z.coerce.number().int().min(1).max(365).default(30)
});

const maintenanceModeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().min(1).max(500).optional()
});

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicStatus() {
    const rows = await this.prisma.client.platformSetting.findMany({
      where: { key: { in: [MAINTENANCE_MODE_KEY, MAINTENANCE_MESSAGE_KEY] } }
    });
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const enabled = map.get(MAINTENANCE_MODE_KEY) === "true";
    return {
      enabled,
      message: map.get(MAINTENANCE_MESSAGE_KEY) ?? DEFAULT_MAINTENANCE_MESSAGE_FR
    } as const;
  }

  async getMaintenanceMode() {
    return this.getPublicStatus();
  }

  async setMaintenanceMode(user: AuthUser, payload: unknown) {
    const input = maintenanceModeSchema.parse(payload);
    const message = input.message?.trim() || DEFAULT_MAINTENANCE_MESSAGE_FR;

    await Promise.all([
      this.prisma.client.platformSetting.upsert({
        where: { key: MAINTENANCE_MODE_KEY },
        create: { key: MAINTENANCE_MODE_KEY, value: input.enabled ? "true" : "false", updatedByUserId: user.userId },
        update: { value: input.enabled ? "true" : "false", updatedByUserId: user.userId }
      }),
      this.prisma.client.platformSetting.upsert({
        where: { key: MAINTENANCE_MESSAGE_KEY },
        create: { key: MAINTENANCE_MESSAGE_KEY, value: message, updatedByUserId: user.userId },
        update: { value: message, updatedByUserId: user.userId }
      })
    ]);

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: input.enabled ? "maintenance.mode_enabled" : "maintenance.mode_disabled",
        targetType: "Maintenance",
        metadata: { message }
      }
    });

    return this.getPublicStatus();
  }

  async purge(user: AuthUser, payload: unknown) {
    const input = purgeSchema.parse(payload);
    const now = Date.now();
    const auditBefore = new Date(now - input.auditLogsRetentionDays * 24 * 60 * 60 * 1000);
    const idempotencyBefore = new Date(now - input.idempotencyRetentionDays * 24 * 60 * 60 * 1000);
    const revokedSessionsBefore = new Date(now - input.revokedSessionsRetentionDays * 24 * 60 * 60 * 1000);

    const platformScope = isPlatformOperator(user.role);

    const [auditResult, idemResult, sessionResult, loginAttemptResult] = await Promise.all([
      this.prisma.client.auditLog.deleteMany({
        where: platformScope
          ? { createdAt: { lt: auditBefore } }
          : { tenantId: user.tenantId, createdAt: { lt: auditBefore } }
      }),
      this.prisma.client.idempotencyKey.deleteMany({
        where: { createdAt: { lt: idempotencyBefore } }
      }),
      this.prisma.client.authSession.deleteMany({
        where: platformScope
          ? { revokedAt: { not: null, lt: revokedSessionsBefore } }
          : {
              tenantId: user.tenantId,
              revokedAt: { not: null, lt: revokedSessionsBefore }
            }
      }),
      this.prisma.client.loginAttempt.deleteMany({
        where: { lockedUntil: null, updatedAt: { lt: idempotencyBefore } }
      })
    ]);

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "maintenance.purge_executed",
        targetType: "Maintenance",
        metadata: {
          deletedAuditLogs: auditResult.count,
          deletedIdempotencyKeys: idemResult.count,
          deletedRevokedSessions: sessionResult.count,
          deletedLoginAttempts: loginAttemptResult.count
        }
      }
    });

    return {
      deletedAuditLogs: auditResult.count,
      deletedIdempotencyKeys: idemResult.count,
      deletedRevokedSessions: sessionResult.count,
      deletedLoginAttempts: loginAttemptResult.count
    };
  }
}
