import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { InvitationStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { env } from "../config/env";
import { invitationEmailHtml } from "../auth/auth-email.util";

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000; // 48h

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum([UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF])
});

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService
  ) {}

  private hashToken(rawToken: string) {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  async createInvitation(user: AuthUser, payload: unknown) {
    const input = createInvitationSchema.parse(payload);
    const email = input.email.toLowerCase();

    const existingMember = await this.prisma.client.user.findUnique({
      where: { tenantId_email: { tenantId: user.tenantId, email } }
    });
    if (existingMember) {
      throw new ConflictException("Cet utilisateur est déjà membre de l'organisation.");
    }

    // Replace any outstanding pending invitation for the same email (re-invite).
    await this.prisma.client.invitation.updateMany({
      where: { tenantId: user.tenantId, email, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED }
    });

    const rawToken = randomBytes(32).toString("hex");
    const invitation = await this.prisma.client.invitation.create({
      data: {
        tenantId: user.tenantId,
        email,
        role: input.role,
        tokenHash: this.hashToken(rawToken),
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedByUserId: user.userId
      }
    });

    await this.audit(user, "invitation.created", invitation.id, { email, role: input.role });

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: { displayName: true }
    });
    const tenantName = tenant?.displayName ?? "Organisation";
    const acceptUrl = `${env.APP_PUBLIC_URL.replace(/\/+$/, "")}/accept-invitation/${rawToken}`;

    await this.mail.send({
      to: [email],
      subject: `Invitation à rejoindre ${tenantName} sur SHADOMA Votes`,
      html: invitationEmailHtml(acceptUrl, user.email, tenantName)
    });

    // The raw token is returned exactly once (delivered to the invitee out-of-band).
    return {
      id: invitation.id,
      email,
      role: input.role,
      token: rawToken,
      expiresAt: invitation.expiresAt.toISOString()
    };
  }

  async listInvitations(user: AuthUser) {
    const items = await this.prisma.client.invitation.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true
      }
    });
    return { items };
  }

  async revokeInvitation(user: AuthUser, invitationId: string) {
    const invitation = await this.prisma.client.invitation.findFirst({
      where: { id: invitationId, tenantId: user.tenantId }
    });
    if (!invitation) {
      throw new NotFoundException("Invitation introuvable.");
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException("Seules les invitations en attente peuvent être révoquées.");
    }
    await this.prisma.client.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED }
    });
    await this.audit(user, "invitation.revoked", invitation.id, { email: invitation.email });
    return { id: invitation.id, status: InvitationStatus.REVOKED };
  }

  private async audit(
    user: AuthUser,
    action: string,
    targetId: string,
    metadata: Record<string, string>
  ) {
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action,
        targetType: "Invitation",
        targetId,
        metadata
      }
    });
  }
}
