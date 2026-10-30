import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { EventStatus, UserRole, WithdrawalStatus } from "@prisma/client";
import { compare } from "bcryptjs";
import { z } from "zod";
import JSZip from "jszip";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";

// Mot de passe actuel ; un compte Google sans mot de passe confirme par son e-mail.
const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  confirmEmail: z.string().email().optional()
});

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

  /**
   * Droit à l'effacement : confirmé par le mot de passe actuel, refusé tant
   * qu'un responsable a de l'argent ou un événement en cours (sinon fonds et
   * votants seraient abandonnés). Efface toutes les données personnelles.
   */
  async anonymizeUserData(user: AuthUser, payload: unknown) {
    const input = deleteAccountSchema.parse(payload);
    const dbUser = await this.prisma.client.user.findUnique({ where: { id: user.userId } });
    const confirmed = dbUser?.passwordHash
      ? Boolean(input.currentPassword) && (await compare(input.currentPassword!, dbUser.passwordHash))
      : Boolean(dbUser && input.confirmEmail && input.confirmEmail.toLowerCase() === dbUser.email.toLowerCase());
    if (!dbUser || !confirmed) {
      throw new UnauthorizedException(dbUser?.passwordHash ? "Mot de passe incorrect." : "Adresse e-mail incorrecte.");
    }

    if (user.role === UserRole.ORGANIZER_OWNER) {
      const [wallet, pendingWithdrawals, liveEvents] = await Promise.all([
        this.prisma.client.organizerWallet.findUnique({ where: { tenantId: user.tenantId } }),
        this.prisma.client.withdrawalRequest.count({
          where: { tenantId: user.tenantId, status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] } }
        }),
        this.prisma.client.event.count({ where: { tenantId: user.tenantId, status: EventStatus.ACTIVE } })
      ]);
      if (liveEvents > 0) {
        throw new BadRequestException("Terminez d'abord vos événements en cours.");
      }
      if (pendingWithdrawals > 0 || (wallet && wallet.withdrawableCfa + wallet.heldCfa > 0)) {
        throw new BadRequestException("Retirez d'abord le solde de votre portefeuille.");
      }
    }

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
          firstName: null,
          lastName: null,
          phone: null,
          photoUrl: null,
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
