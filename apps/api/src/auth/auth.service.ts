import { ConflictException, BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { AuthEmailTokenPurpose, InvitationStatus, UserRole } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { buildAuthActionUrl, passwordResetEmailHtml, verificationEmailHtml } from "./auth-email.util";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../privacy/privacy-policy";
import type { AuthUser } from "./auth.types";

// Politique appliquée aux NOUVEAUX mots de passe (inscription, reset, invitation).
// Le login garde .min(8) pour continuer d'accepter les mots de passe existants.
// bcryptjs tronque au-delà de 72 octets : on rejette explicitement plutôt que
// de tronquer en silence.
const strongPassword = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(72, "Le mot de passe ne peut pas dépasser 72 caractères.")
  .refine(
    (value) => {
      const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
      return classes >= 2;
    },
    "Le mot de passe doit combiner au moins deux types de caractères (minuscule, majuscule, chiffre ou symbole)."
  );

const registerSchema = z.object({
  tenantSlug: z.string().min(3).max(60),
  tenantDisplayName: z.string().min(2).max(120),
  email: z.string().email(),
  password: strongPassword,
  // The organizer accepts the privacy policy once, here at account creation.
  // Must be explicitly true — registration is refused otherwise.
  acceptPrivacyPolicy: z.literal(true)
});

const loginSchema = z.object({
  tenantSlug: z.string().min(3).max(60).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(32)
});

const acceptInvitationSchema = z.object({
  token: z.string().min(32),
  password: strongPassword
});

const verifyEmailSchema = z.object({
  token: z.string().min(32)
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(3).max(60).optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(3).max(60).optional()
});

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: strongPassword
});

export type SessionMeta = { userAgent?: string | null; ipAddress?: string | null };

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Bound the access token to this issuer/audience so a token minted for another
// context (or with a tampered header) is rejected by jwtVerify.
const JWT_ISSUER = "shadowa-votes";
const JWT_AUDIENCE = "shadowa-votes-api";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService
  ) {}

  private getAttemptKey(tenantSlug: string, email: string) {
    return `${tenantSlug.toLowerCase()}:${email.toLowerCase()}`;
  }

  // Lockout state lives in PostgreSQL so it is shared across all API instances
  // and survives restarts — never an in-memory Map (which is per-instance and
  // leaks on horizontally-scaled deployments like Cloud Run).
  private async checkLoginLock(tenantSlug: string, email: string) {
    const identifier = this.getAttemptKey(tenantSlug, email);
    const entry = await this.prisma.client.loginAttempt.findUnique({ where: { identifier } });
    if (!entry?.lockedUntil) {
      return;
    }
    if (entry.lockedUntil.getTime() > Date.now()) {
      const remainingSeconds = Math.ceil((entry.lockedUntil.getTime() - Date.now()) / 1000);
      throw new UnauthorizedException(
        `Compte temporairement verrouillé. Réessayez dans ${remainingSeconds} secondes.`
      );
    }
    // Lock expired — reset so the counter starts fresh.
    await this.prisma.client.loginAttempt
      .deleteMany({ where: { identifier } })
      .catch(() => undefined);
  }

  private async recordFailedLogin(tenantSlug: string, email: string) {
    const identifier = this.getAttemptKey(tenantSlug, email);
    const existing = await this.prisma.client.loginAttempt.findUnique({ where: { identifier } });
    const count = (existing?.count ?? 0) + 1;
    const lockedUntil = count >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
    await this.prisma.client.loginAttempt.upsert({
      where: { identifier },
      create: { identifier, count, lockedUntil },
      update: { count, lockedUntil }
    });
  }

  private async clearLoginAttempts(tenantSlug: string, email: string) {
    await this.prisma.client.loginAttempt.deleteMany({
      where: { identifier: this.getAttemptKey(tenantSlug, email) }
    });
  }

  // Forensic trail for authentication. Best-effort (never blocks or fails a
  // login) and scoped to a tenant — without a resolved tenant there is no
  // audit scope, so the write is skipped. Metadata stays non-sensitive: no
  // password, no token, just IP and user-agent for anomaly detection.
  private async auditLogin(
    action: "auth.login" | "auth.login_failed",
    tenantId: string | null,
    userId: string | null,
    meta?: SessionMeta
  ) {
    if (!tenantId) return;
    await this.prisma.client.auditLog
      .create({
        data: {
          tenantId,
          actorUserId: userId ?? "unknown",
          actorRole: UserRole.ORGANIZER_OWNER,
          action,
          targetType: "User",
          targetId: userId,
          metadata: { ip: meta?.ipAddress ?? null, userAgent: meta?.userAgent ?? null }
        }
      })
      .catch(() => undefined);
  }

  async register(payload: unknown, meta?: SessionMeta) {
    const input = registerSchema.parse(payload);
    const normalizedSlug = input.tenantSlug.toLowerCase();
    const normalizedEmail = input.email.toLowerCase();

    // SECURITY: registration always provisions a NEW tenant. A duplicate slug
    // is rejected (409) — it must NOT silently attach the new account to an
    // existing tenant. Slugs are public (vote URLs), so reusing one would let
    // anyone register as ORGANIZER_OWNER of another organizer's tenant.
    // Adding members to an existing tenant is a separate authenticated flow.
    const existingTenant = await this.prisma.client.tenant.findUnique({
      where: { slug: normalizedSlug }
    });
    if (existingTenant) {
      throw new ConflictException("Ce slug d'organisation est déjà utilisé.");
    }

    const tenant = await this.prisma.client.tenant
      .create({
        data: {
          slug: normalizedSlug,
          displayName: input.tenantDisplayName
        }
      })
      .catch((error: unknown) => {
        // Unique-constraint backstop for the check-then-create race window.
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException("Ce slug d'organisation est déjà utilisé.");
        }
        throw error;
      });

    const passwordHash = await hash(input.password, 12);
    const user = await this.prisma.client.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        role: UserRole.ORGANIZER_OWNER,
        privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
        privacyAcceptedAt: new Date()
      }
    });

    const authUser = {
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl
    } satisfies AuthUser;

    if (env.NODE_ENV === "test") {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() }
      });
      const accessToken = await this.signAccessToken(authUser);
      const { refreshToken } = await this.createSession(authUser, undefined, meta);
      return { accessToken, refreshToken };
    }

    const verifyUrl = await this.sendVerificationEmail(user.id, user.email);
    return {
      requiresEmailVerification: true as const,
      email: normalizedEmail,
      ...(verifyUrl.exposeInResponse ? { verificationUrl: verifyUrl.url } : {})
    };
  }

  async login(payload: unknown, meta?: SessionMeta) {
    const input = loginSchema.parse(payload);
    const normalizedEmail = input.email.toLowerCase();

    let normalizedSlug = input.tenantSlug?.toLowerCase();

    if (!normalizedSlug) {
      const matches = await this.prisma.client.user.findMany({
        where: { email: normalizedEmail },
        select: { tenantId: true, tenant: { select: { slug: true } } }
      });
      if (matches.length === 0) {
        throw new UnauthorizedException("Identifiants invalides.");
      }
      if (matches.length > 1) {
        throw new BadRequestException(
          "Plusieurs espaces sont associés à cet e-mail. Indiquez votre code d'organisation."
        );
      }
      normalizedSlug = matches[0]!.tenant.slug;
    }

    // Check if account is locked due to too many failed attempts
    await this.checkLoginLock(normalizedSlug, normalizedEmail);

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug: normalizedSlug }
    });
    if (!tenant) {
      await this.recordFailedLogin(normalizedSlug, normalizedEmail);
      throw new UnauthorizedException("Identifiants invalides.");
    }

    const user = await this.prisma.client.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: normalizedEmail
        }
      }
    });
    if (!user) {
      await this.recordFailedLogin(normalizedSlug, normalizedEmail);
      await this.auditLogin("auth.login_failed", tenant.id, null, meta);
      throw new UnauthorizedException("Identifiants invalides.");
    }

    if (!user.passwordHash) {
      await this.recordFailedLogin(normalizedSlug, normalizedEmail);
      await this.auditLogin("auth.login_failed", tenant.id, user.id, meta);
      throw new UnauthorizedException("Identifiants invalides.");
    }
    const isValidPassword = await compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      await this.recordFailedLogin(normalizedSlug, normalizedEmail);
      await this.auditLogin("auth.login_failed", tenant.id, user.id, meta);
      throw new UnauthorizedException("Identifiants invalides.");
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: "Confirmez votre adresse e-mail avant de vous connecter. Consultez votre boîte mail.",
        code: "EMAIL_NOT_VERIFIED"
      });
    }

    if (user.suspendedAt) {
      throw new ForbiddenException({
        message: user.suspendedReason ?? "Ce compte est suspendu. Contactez le support.",
        code: "ACCOUNT_SUSPENDED"
      });
    }

    // Successful login — clear any previous failed attempts
    await this.clearLoginAttempts(normalizedSlug, normalizedEmail);

    const authUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl
    } satisfies AuthUser;
    const accessToken = await this.signAccessToken(authUser);
    const { refreshToken } = await this.createSession(authUser, undefined, meta);

    await this.auditLogin("auth.login", user.tenantId, user.id, meta);

    return { accessToken, refreshToken };
  }

  async refresh(payload: unknown, meta?: SessionMeta) {
    const input = refreshSchema.parse(payload);
    const refreshTokenHash = this.hashToken(input.refreshToken);

    // Look the token up regardless of state so we can detect REUSE: refresh
    // tokens are single-use (rotated on every refresh). If an already-revoked
    // token is presented, it was either replayed by an attacker who captured a
    // rotated token, or by a victim whose token was stolen — either way it is a
    // breach signal. We revoke the entire session chain for that user so the
    // stolen token can no longer mint access, then reject.
    const session = await this.prisma.client.authSession.findFirst({
      where: { refreshTokenHash }
    });
    if (!session) {
      throw new UnauthorizedException("Session invalide ou expirée.");
    }
    if (session.revokedAt) {
      await this.prisma.client.authSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await this.prisma.client.auditLog
        .create({
          data: {
            tenantId: session.tenantId,
            actorUserId: session.userId,
            actorRole: UserRole.ORGANIZER_OWNER,
            action: "auth.refresh_token_reuse_detected",
            targetType: "AuthSession",
            targetId: session.id,
            metadata: { revokedChain: true }
          }
        })
        .catch(() => undefined);
      throw new UnauthorizedException("Session révoquée (réutilisation détectée).");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Session invalide ou expirée.");
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: session.userId }
    });
    if (!user) {
      throw new UnauthorizedException("Utilisateur introuvable.");
    }
    if (user.suspendedAt) {
      throw new UnauthorizedException(user.suspendedReason ?? "Compte suspendu.");
    }

    await this.prisma.client.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl
    };
    const accessToken = await this.signAccessToken(authUser);
    const { refreshToken } = await this.createSession(authUser, session.id, meta);

    return { accessToken, refreshToken };
  }

  async logout(payload: unknown) {
    const input = refreshSchema.parse(payload);
    const refreshTokenHash = this.hashToken(input.refreshToken);
    const session = await this.prisma.client.authSession.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null
      }
    });
    if (session) {
      await this.prisma.client.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
    }
    return { success: true };
  }

  async acceptInvitation(payload: unknown, meta?: SessionMeta) {
    const input = acceptInvitationSchema.parse(payload);
    const tokenHash = this.hashToken(input.token);

    const invitation = await this.prisma.client.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new UnauthorizedException("Invitation invalide.");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.client.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED }
      });
      throw new UnauthorizedException("Invitation expirée.");
    }

    const existingUser = await this.prisma.client.user.findUnique({
      where: { tenantId_email: { tenantId: invitation.tenantId, email: invitation.email } }
    });
    if (existingUser) {
      throw new ConflictException("Cet utilisateur est déjà membre de l'organisation.");
    }

    const passwordHash = await hash(input.password, 12);
    const user = await this.prisma.client.user.create({
      data: {
        tenantId: invitation.tenantId,
        email: invitation.email,
        passwordHash,
        role: invitation.role,
        emailVerifiedAt: new Date()
      }
    });
    await this.prisma.client.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: invitation.tenantId,
        actorUserId: user.id,
        actorRole: user.role,
        action: "invitation.accepted",
        targetType: "User",
        targetId: user.id,
        metadata: { invitationId: invitation.id }
      }
    });
    void this.notifications.create(invitation.tenantId, "INVITATION_ACCEPTED", {
      email: invitation.email
    });

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl
    };
    const accessToken = await this.signAccessToken(authUser);
    const { refreshToken } = await this.createSession(authUser, undefined, meta);
    return { accessToken, refreshToken };
  }

  async verifyEmail(payload: unknown) {
    const input = verifyEmailSchema.parse(payload);
    const user = await this.consumeEmailToken(input.token, AuthEmailTokenPurpose.EMAIL_VERIFICATION);
    if (!user) {
      throw new BadRequestException("Lien de confirmation invalide ou expiré.");
    }
    if (!user.emailVerifiedAt) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() }
      });
    }
    return { success: true, email: user.email };
  }

  async resendVerificationEmail(payload: unknown) {
    const input = resendVerificationSchema.parse(payload);
    const user = await this.resolveUserByEmail(input.email, input.tenantSlug);
    let verificationUrl: string | undefined;
    if (user && !user.emailVerifiedAt) {
      const result = await this.sendVerificationEmail(user.id, user.email);
      if (result.exposeInResponse) {
        verificationUrl = result.url;
      }
    }
    return {
      success: true,
      message: "Si un compte non confirmé existe, un nouvel e-mail a été envoyé.",
      ...(verificationUrl ? { verificationUrl } : {})
    };
  }

  async forgotPassword(payload: unknown) {
    const input = forgotPasswordSchema.parse(payload);
    const user = await this.resolveUserByEmail(input.email, input.tenantSlug);
    const result: Record<string, unknown> = {
      success: true,
      message: "Si un compte existe pour cet e-mail, un lien de réinitialisation a été envoyé."
    };
    if (user?.emailVerifiedAt) {
      const { url, exposeInResponse } = await this.sendPasswordResetEmail(user.id, user.email);
      if (exposeInResponse) {
        result.resetUrl = url;
      }
    }
    return result;
  }

  async resetPassword(payload: unknown) {
    const input = resetPasswordSchema.parse(payload);
    const user = await this.consumeEmailToken(input.token, AuthEmailTokenPurpose.PASSWORD_RESET);
    if (!user) {
      throw new BadRequestException("Lien de réinitialisation invalide ou expiré.");
    }
    const passwordHash = await hash(input.password, 12);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
    await this.prisma.client.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return { success: true };
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const secret = new TextEncoder().encode(env.API_JWT_SECRET);
    // Pin the accepted algorithm: the access token is signed with HS256, so we
    // reject anything else explicitly (defence-in-depth against algorithm
    // confusion, on top of jose already rejecting asymmetric algs for a
    // symmetric key).
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });

    const result = z
      .object({
        sub: z.string().min(1),
        tenantId: z.string().min(1),
        role: z.nativeEnum(UserRole),
        email: z.string().email(),
        firstName: z.string().optional().nullable(),
        lastName: z.string().optional().nullable(),
        photoUrl: z.string().optional().nullable()
      })
      .parse(payload);

    const dbUser = await this.prisma.client.user.findUnique({
      where: { id: result.sub },
      select: { suspendedAt: true, suspendedReason: true }
    });
    if (!dbUser) {
      throw new UnauthorizedException("Session invalide.");
    }
    if (dbUser.suspendedAt) {
      throw new UnauthorizedException(dbUser.suspendedReason ?? "Compte suspendu.");
    }

    const authUser: AuthUser = {
      userId: result.sub,
      tenantId: result.tenantId,
      role: result.role,
      email: result.email
    };
    if (result.firstName !== undefined) authUser.firstName = result.firstName;
    if (result.lastName !== undefined) authUser.lastName = result.lastName;
    if (result.photoUrl !== undefined) authUser.photoUrl = result.photoUrl;
    return authUser;
  }

  async issueAccessToken(user: AuthUser): Promise<string> {
    return this.signAccessToken(user);
  }

  hashRefreshToken(raw: string): string {
    return this.hashToken(raw);
  }

  private async signAccessToken(user: AuthUser): Promise<string> {
    const secret = new TextEncoder().encode(env.API_JWT_SECRET);
    return new SignJWT({
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      photoUrl: user.photoUrl ?? null
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.userId)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${env.API_JWT_EXPIRES_IN_SECONDS}s`)
      .sign(secret);
  }

  private hashToken(rawToken: string) {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  private async createSession(user: AuthUser, rotatedFromSessionId?: string, meta?: SessionMeta) {
    const refreshToken = randomBytes(48).toString("hex");
    const refreshTokenHash = this.hashToken(refreshToken);
    const data: {
      tenantId: string;
      userId: string;
      refreshTokenHash: string;
      expiresAt: Date;
      rotatedFromSessionId?: string | null;
      userAgent: string | null;
      ipAddress: string | null;
    } = {
      tenantId: user.tenantId,
      userId: user.userId,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + env.API_REFRESH_TOKEN_EXPIRES_IN_SECONDS * 1000),
      userAgent: meta?.userAgent ?? null,
      ipAddress: meta?.ipAddress ?? null
    };
    if (rotatedFromSessionId) {
      data.rotatedFromSessionId = rotatedFromSessionId;
    }
    await this.prisma.client.authSession.create({
      data
    });
    return { refreshToken };
  }

  private async resolveUserByEmail(email: string, tenantSlug?: string) {
    const normalizedEmail = email.toLowerCase();
    if (tenantSlug) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { slug: tenantSlug.toLowerCase() }
      });
      if (!tenant) return null;
      return this.prisma.client.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } }
      });
    }
    const matches = await this.prisma.client.user.findMany({
      where: { email: normalizedEmail },
      take: 2
    });
    if (matches.length !== 1) return null;
    return matches[0] ?? null;
  }

  private async sendVerificationEmail(
    userId: string,
    email: string
  ): Promise<{ url: string; exposeInResponse: boolean }> {
    const rawToken = await this.createEmailToken(userId, AuthEmailTokenPurpose.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS);
    const verifyUrl = buildAuthActionUrl("/verify-email", rawToken);
    const sent = await this.mail.send({
      to: [email],
      subject: "Confirmez votre adresse e-mail — SHADOMA Votes",
      html: verificationEmailHtml(verifyUrl),
      text: `Confirmez votre e-mail : ${verifyUrl}`
    });
    if (!sent) {
      this.logger.warn(`[mail:dev] Vérification e-mail → ${email}: ${verifyUrl}`);
    }
    return { url: verifyUrl, exposeInResponse: !sent };
  }

  private async sendPasswordResetEmail(
    userId: string,
    email: string
  ): Promise<{ url: string; exposeInResponse: boolean }> {
    const rawToken = await this.createEmailToken(userId, AuthEmailTokenPurpose.PASSWORD_RESET, PASSWORD_RESET_TTL_MS);
    const resetUrl = buildAuthActionUrl("/reset-password", rawToken);
    const sent = await this.mail.send({
      to: [email],
      subject: "Réinitialisez votre mot de passe — SHADOMA Votes",
      html: passwordResetEmailHtml(resetUrl),
      text: `Réinitialiser le mot de passe : ${resetUrl}`
    });
    if (!sent) {
      this.logger.warn(`[mail:dev] Réinitialisation mot de passe → ${email}: ${resetUrl}`);
    }
    return { url: resetUrl, exposeInResponse: !sent };
  }

  private async createEmailToken(userId: string, purpose: AuthEmailTokenPurpose, ttlMs: number) {
    await this.prisma.client.authEmailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() }
    });
    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.client.authEmailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMs)
      }
    });
    return rawToken;
  }

  private async consumeEmailToken(rawToken: string, purpose: AuthEmailTokenPurpose) {
    const tokenHash = this.hashToken(rawToken);
    const row = await this.prisma.client.authEmailToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      return null;
    }
    await this.prisma.client.authEmailToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() }
    });
    return row.user;
  }
}
