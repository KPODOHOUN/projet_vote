import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72)
});
const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1)
});

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly authService: AuthService) {}

  private async requireUser(user: AuthUser) {
    const row = await this.prisma.client.user.findUnique({ where: { id: user.userId } });
    if (!row) throw new NotFoundException("Compte introuvable.");
    return row;
  }

  async getAccount(user: AuthUser) {
    const row = await this.requireUser(user);
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant) throw new NotFoundException("Organisation introuvable.");
    return {
      email: row.email,
      role: row.role,
      tenant: { displayName: tenant.displayName, slug: tenant.slug },
      createdAt: row.createdAt.toISOString()
    };
  }

  private async revokeOthers(userId: string, currentRefreshToken?: string) {
    if (!currentRefreshToken) throw new BadRequestException("Session courante introuvable.");
    const currentHash = this.authService.hashRefreshToken(currentRefreshToken);
    const result = await this.prisma.client.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        refreshTokenHash: { not: currentHash }
      },
      data: { revokedAt: new Date() }
    });
    return result.count;
  }

  async changePassword(user: AuthUser, payload: unknown, currentRefreshToken?: string) {
    const input = changePasswordSchema.parse(payload);
    const row = await this.requireUser(user);
    const ok = await compare(input.currentPassword, row.passwordHash ?? "");
    if (!ok) throw new UnauthorizedException("Mot de passe actuel invalide.");
    await this.prisma.client.user.update({ where: { id: row.id }, data: { passwordHash: await hash(input.newPassword, 12) } });
    await this.revokeOthers(row.id, currentRefreshToken);
    await this.audit(user, "account.password.changed", row.id, {});
    return { success: true as const };
  }

  async changeEmail(user: AuthUser, payload: unknown, currentRefreshToken?: string) {
    const input = changeEmailSchema.parse(payload);
    const row = await this.requireUser(user);
    const ok = await compare(input.currentPassword, row.passwordHash ?? "");
    if (!ok) throw new UnauthorizedException("Mot de passe actuel invalide.");
    const newEmail = input.newEmail.toLowerCase();
    if (newEmail !== row.email) {
      const existing = await this.prisma.client.user.findUnique({ where: { tenantId_email: { tenantId: user.tenantId, email: newEmail } } });
      if (existing) throw new ConflictException("Cette adresse est déjà utilisée dans l'organisation.");
    }
    await this.prisma.client.user.update({ where: { id: row.id }, data: { email: newEmail } });
    await this.revokeOthers(row.id, currentRefreshToken);
    await this.audit(user, "account.email.changed", row.id, { email: newEmail });
    const accessToken = await this.authService.issueAccessToken({ ...user, email: newEmail });
    return { accessToken };
  }

  async listSessions(user: AuthUser, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken ? this.authService.hashRefreshToken(currentRefreshToken) : null;
    const rows = await this.prisma.client.authSession.findMany({
      where: { userId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true, refreshTokenHash: true }
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: currentHash != null && s.refreshTokenHash === currentHash
      }))
    };
  }

  async revokeOtherSessions(user: AuthUser, currentRefreshToken?: string) {
    if (!currentRefreshToken) throw new BadRequestException("Session courante introuvable.");
    const revoked = await this.revokeOthers(user.userId, currentRefreshToken);
    await this.audit(user, "account.session.revoked", user.userId, { scope: "others" });
    return { revoked };
  }

  async revokeSession(user: AuthUser, sessionId: string) {
    const session = await this.prisma.client.authSession.findFirst({ where: { id: sessionId, userId: user.userId } });
    if (!session) throw new NotFoundException("Session introuvable.");
    if (!session.revokedAt) {
      await this.prisma.client.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await this.audit(user, "account.session.revoked", session.id, { scope: "one" });
    }
    return { id: session.id, revoked: true as const };
  }

  private async audit(user: AuthUser, action: string, targetId: string, metadata: Record<string, string>) {
    await this.prisma.client.auditLog.create({
      data: { tenantId: user.tenantId, actorUserId: user.userId, actorRole: user.role, action, targetType: "Account", targetId, metadata }
    });
  }
}
