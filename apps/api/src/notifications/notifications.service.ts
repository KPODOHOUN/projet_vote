import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { NotificationType, Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Best-effort : ne lève jamais. Fan-out vers les membres non-STAFF du tenant.
  async create(tenantId: string, type: NotificationType, data: Prisma.JsonObject): Promise<void> {
    try {
      const recipients = await this.prisma.client.user.findMany({
        where: { tenantId, role: { not: "ORGANIZER_STAFF" } },
        select: { id: true }
      });
      if (recipients.length === 0) return;
      await this.prisma.client.notification.createMany({
        data: recipients.map((r) => ({ tenantId, userId: r.id, type, data }))
      });
    } catch (error) {
      this.logger.error(`notification create failed (${type}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Best-effort : notifications pour tous les admins plateforme.
  async createForPlatformAdmins(type: NotificationType, data: Prisma.JsonObject): Promise<void> {
    try {
      const admins = await this.prisma.client.user.findMany({
        where: { role: { in: ["PLATFORM_ADMIN", "PLATFORM_SUPER_ADMIN"] } },
        select: { id: true, tenantId: true }
      });
      if (admins.length === 0) return;
      await this.prisma.client.notification.createMany({
        data: admins.map((a) => ({ tenantId: a.tenantId, userId: a.id, type, data }))
      });
    } catch (error) {
      this.logger.error(
        `platform admin notification failed (${type}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async list(user: AuthUser, opts: { limit?: number; unreadOnly?: boolean }) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const rows = await this.prisma.client.notification.findMany({
      where: { userId: user.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, type: true, data: true, readAt: true, createdAt: true }
    });
    return {
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString()
      }))
    };
  }

  async unreadCount(user: AuthUser) {
    const count = await this.prisma.client.notification.count({ where: { userId: user.userId, readAt: null } });
    return { count };
  }

  async markRead(user: AuthUser, id: string) {
    const row = await this.prisma.client.notification.findFirst({ where: { id, userId: user.userId } });
    if (!row) throw new NotFoundException("Notification introuvable.");
    const readAt = row.readAt ?? new Date();
    if (!row.readAt) {
      await this.prisma.client.notification.update({ where: { id: row.id }, data: { readAt } });
    }
    return { id: row.id, readAt: readAt.toISOString() };
  }

  async markAllRead(user: AuthUser) {
    const result = await this.prisma.client.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() }
    });
    return { updated: result.count };
  }
}
