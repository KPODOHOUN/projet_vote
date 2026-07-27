import { Injectable } from "@nestjs/common";
import JSZip from "jszip";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async buildUserExportArchive(user: AuthUser) {
    const [profile, sessions, auditLogs] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      this.prisma.client.authSession.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      this.prisma.client.auditLog.findMany({
        where: { actorUserId: user.userId, tenantId: user.tenantId },
        orderBy: { createdAt: "desc" },
        take: 500
      })
    ]);

    const payload = {
      generatedAt: new Date().toISOString(),
      profile,
      sessions,
      auditLogs
    };

    const zip = new JSZip();
    zip.file("user-export.json", JSON.stringify(payload, null, 2));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  async anonymizeUserData(user: AuthUser) {
    const anonymizedEmail = `deleted+${user.userId}@anonymized.vzp`;
    const now = new Date();

    await this.prisma.client.$transaction([
      this.prisma.client.authSession.updateMany({
        where: { userId: user.userId, revokedAt: null },
        data: { revokedAt: now }
      }),
      this.prisma.client.user.update({
        where: { id: user.userId },
        data: {
          email: anonymizedEmail,
          passwordHash: `deleted-${user.userId}`,
          updatedAt: now
        }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "privacy.user_data_deleted",
          targetType: "User",
          targetId: user.userId,
          metadata: {
            anonymizedEmail
          }
        }
      })
    ]);

    return {
      success: true,
      anonymizedEmail
    };
  }
}
