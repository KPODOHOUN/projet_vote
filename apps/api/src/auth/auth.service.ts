import { ConflictException, BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { AuthOtpPurpose, InvitationStatus, TenantOfferType, UserRole } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { otpPasswordResetEmailHtml, otpVerificationEmailHtml } from "./auth-email.util";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../privacy/privacy-policy";
import {
  DEFAULT_OTP_RESEND_DELAY_SECONDS,
  DEFAULT_OTP_TTL_SECONDS,
  OFFER1_ENABLED_KEY,
  OTP_RESEND_DELAY_SECONDS_KEY,
  OTP_TTL_SECONDS_KEY,
  parseBoolSetting,
  parseIntSetting
} from "../common/platform-settings";
import { DEFAULT_OFFER1_ENABLED } from "../offers/offer-settings.service";
import type { AuthUser } from "./auth.types";

// Politique appliquée aux NOUVEAUX mots de passe (inscription, reset, invitation).
// Le login garde .min(8) pour continuer d'accepter les mots de passe existants.
// bcryptjs tronque au-delà de 72 octets : on rejette explicitement plutôt que
// de tronquer en silence.
export const strongPasswordSchema = z
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

const registerSchema = z
  .object({
    tenantSlug: z.string().min(3).max(60),
    tenantDisplayName: z.string().min(2).max(120),
    email: z.string().email(),
    password: strongPasswordSchema,
    passwordConfirm: z.string().optional(),
    firstName: z.string().min(1).max(80).optional(),
    lastName: z.string().min(1).max(80).optional(),
    phone: z.string().min(6).max(30).optional(),
    offerType: z.nativeEnum(TenantOfferType),
    // The organizer accepts the privacy policy once, here at account creation.
    // Must be explicitly true — registration is refused otherwise.
    acceptPrivacyPolicy: z.literal(true)
  })
  .refine((data) => data.passwordConfirm === undefined || data.passwordConfirm === data.password, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["passwordConfirm"]
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
  password: strongPasswordSchema
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Le code OTP doit contenir 6 chiffres."),
  purpose: z.nativeEnum(AuthOtpPurpose).default(AuthOtpPurpose.EMAIL_VERIFICATION),
  tenantSlug: z.string().min(3).max(60).optional()
});

const resendOtpSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(3).max(60).optional(),
  purpose: z.nativeEnum(AuthOtpPurpose).default(AuthOtpPurpose.EMAIL_VERIFICATION)
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(3).max(60).optional()
});

const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    code: z.string().regex(/^\d{6}$/, "Le code OTP doit contenir 6 chiffres."),
    password: strongPasswordSchema,
    passwordConfirm: z.string().optional(),
    tenantSlug: z.string().min(3).max(60).optional()
  })
  .refine((data) => data.passwordConfirm === undefined || data.passwordConfirm === data.password, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["passwordConfirm"]
  });

export type SessionMeta = { userAgent?: string | null; ipAddress?: string | null };

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const OTP_MAX_ATTEMPTS = 5;

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

  private async auditOtp(
    action: "auth.otp_verified" | "auth.otp_validated" | "auth.otp_failed",
    tenantId: string,
    userId: string,
    actorRole: UserRole,
    purpose: AuthOtpPurpose,
    meta?: SessionMeta
  ) {
    await this.prisma.client.auditLog
      .create({
        data: {
          tenantId,
          actorUserId: userId,
          actorRole,
          action,
          targetType: "AuthOtpChallenge",
          targetId: userId,
          metadata: {
            purpose,
            ip: meta?.ipAddress ?? null,
            userAgent: meta?.userAgent ?? null
          }
        }
      })
      .catch(() => undefined);
  }

  async register(payload: unknown, meta?: SessionMeta) {
    const input = registerSchema.parse(payload);
    const normalizedSlug = input.tenantSlug.toLowerCase();
    const normalizedEmail = input.email.toLowerCase();

    if (input.offerType === TenantOfferType.EXTERNAL) {
      const offer1Row = await this.prisma.client.platformSetting.findUnique({
        where: { key: OFFER1_ENABLED_KEY }
      });
      const offer1Enabled = parseBoolSetting(offer1Row?.value, DEFAULT_OFFER1_ENABLED);
      if (!offer1Enabled) {
        throw new BadRequestException(
          "L'offre External est en réflexion et indisponible. Choisissez l'offre Escrow (encaissement plateforme)."
        );
      }
    }

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
          displayName: input.tenantDisplayName,
          offerType: input.offerType
        }
      })
      .catch((error: unknown) => {
        // Unique-constraint backstop for the check-then-create race window.
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException("Ce slug d'organisation est déjà utilisé.");
        }
        throw error;
      });

    if (input.offerType === TenantOfferType.ESCROW) {
      await this.prisma.client.organizerWallet.create({
        data: { tenantId: tenant.id }
      });
    }

    const passwordHash = await hash(input.password, 12);
    const user = await this.prisma.client.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        role: UserRole.ORGANIZER_OWNER,
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
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

    const otpResult = await this.createAndSendOtp(user.id, user.email, AuthOtpPurpose.EMAIL_VERIFICATION);
    return {
      requiresEmailVerification: true as const,
      email: normalizedEmail,
      ...(otpResult.exposeInResponse ? { otpCode: otpResult.code } : {})
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
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Adresse e-mail non vérifiée.");
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

  /** @deprecated Prefer verifyOtp. Magic-link email verification is removed. */
  async verifyEmail(_payload: unknown) {
    throw new BadRequestException(
      "La vérification par lien e-mail n'est plus disponible. Utilisez POST /auth/verify-otp avec le code à 6 chiffres."
    );
  }

  async verifyOtp(payload: unknown, meta?: SessionMeta) {
    const input = verifyOtpSchema.parse(payload);
    const user = await this.resolveUserByEmail(input.email, input.tenantSlug);
    if (!user) {
      throw new BadRequestException("Code invalide ou expiré.");
    }
    if (user.suspendedAt) {
      throw new BadRequestException("Code invalide ou expiré.");
    }

    const challenge = await this.prisma.client.authOtpChallenge.findFirst({
      where: {
        userId: user.id,
        purpose: input.purpose,
        consumedAt: null
      },
      orderBy: { createdAt: "desc" }
    });
    if (!challenge) {
      throw new BadRequestException("Code invalide ou expiré.");
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Code invalide ou expiré.");
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException("Trop de tentatives. Demandez un nouveau code.");
    }

    const expected = Buffer.from(challenge.codeHash, "utf8");
    const provided = Buffer.from(
      this.hashOtpCode(user.id, input.purpose, input.code),
      "utf8"
    );
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!matches) {
      const updated = await this.prisma.client.authOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } }
      });
      await this.auditOtp(
        "auth.otp_failed",
        user.tenantId,
        user.id,
        user.role,
        input.purpose,
        meta
      );
      if (updated.attempts >= updated.maxAttempts) {
        throw new BadRequestException("Trop de tentatives. Demandez un nouveau code.");
      }
      throw new BadRequestException("Code invalide ou expiré.");
    }

    if (input.purpose === AuthOtpPurpose.PASSWORD_RESET) {
      await this.auditOtp(
        "auth.otp_validated",
        user.tenantId,
        user.id,
        user.role,
        input.purpose,
        meta
      );
      return { success: true as const, resetAuthorized: true as const };
    }

    // EMAIL_VERIFICATION → mark verified + auto-login session
    await this.consumeOtpChallenge(challenge.id);
    await this.auditOtp(
      "auth.otp_verified",
      user.tenantId,
      user.id,
      user.role,
      input.purpose,
      meta
    );
    if (!user.emailVerifiedAt) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() }
      });
    }

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
    return { accessToken, refreshToken, success: true as const };
  }

  /** @deprecated Prefer resendOtp. */
  async resendVerificationEmail(payload: unknown) {
    return this.resendOtp({
      ...(typeof payload === "object" && payload !== null ? payload : {}),
      purpose: AuthOtpPurpose.EMAIL_VERIFICATION
    });
  }

  async resendOtp(payload: unknown) {
    const input = resendOtpSchema.parse(payload);
    const antiEnumMessage =
      input.purpose === AuthOtpPurpose.PASSWORD_RESET
        ? "Si un compte existe pour cet e-mail, un nouveau code a été envoyé."
        : "Si un compte non confirmé existe, un nouvel e-mail a été envoyé.";

    const result: Record<string, unknown> = {
      success: true,
      message: antiEnumMessage
    };

    const user = await this.resolveUserByEmail(input.email, input.tenantSlug);
    if (!user) {
      return result;
    }

    const eligible =
      input.purpose === AuthOtpPurpose.EMAIL_VERIFICATION
        ? !user.emailVerifiedAt
        : Boolean(user.emailVerifiedAt);

    if (!eligible) {
      return result;
    }

    const delaySeconds = await this.getOtpResendDelaySeconds();
    const latest = await this.prisma.client.authOtpChallenge.findFirst({
      where: { userId: user.id, purpose: input.purpose },
      orderBy: { lastSentAt: "desc" }
    });
    if (latest) {
      const elapsedMs = Date.now() - latest.lastSentAt.getTime();
      if (elapsedMs < delaySeconds * 1000) {
        return result;
      }
    }

    const otpResult = await this.createAndSendOtp(user.id, user.email, input.purpose);
    if (otpResult.exposeInResponse) {
      result.otpCode = otpResult.code;
    }
    return result;
  }

  async forgotPassword(payload: unknown) {
    const input = forgotPasswordSchema.parse(payload);
    const result: Record<string, unknown> = {
      success: true,
      message: "Si un compte existe pour cet e-mail, un code de réinitialisation a été envoyé."
    };
    const user = await this.resolveUserByEmail(input.email, input.tenantSlug);
    if (user?.emailVerifiedAt) {
      const delaySeconds = await this.getOtpResendDelaySeconds();
      const latest = await this.prisma.client.authOtpChallenge.findFirst({
        where: { userId: user.id, purpose: AuthOtpPurpose.PASSWORD_RESET },
        orderBy: { lastSentAt: "desc" }
      });
      if (latest) {
        const elapsedMs = Date.now() - latest.lastSentAt.getTime();
        if (elapsedMs < delaySeconds * 1000) {
          return result;
        }
      }
      const otpResult = await this.createAndSendOtp(user.id, user.email, AuthOtpPurpose.PASSWORD_RESET);
      if (otpResult.exposeInResponse) {
        result.otpCode = otpResult.code;
      }
    }
    return result;
  }

  async resetPassword(payload: unknown) {
    const input = resetPasswordSchema.parse(payload);
    const user = await this.resolveUserByEmail(input.email, input.tenantSlug);
    if (!user) {
      throw new BadRequestException("Code invalide ou expiré.");
    }

    await this.verifyAndConsumeOtpChallenge(
      user.id,
      input.code,
      AuthOtpPurpose.PASSWORD_RESET
    );

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
      select: {
        tenantId: true,
        role: true,
        email: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        suspendedReason: true
      }
    });
    if (!dbUser) {
      throw new UnauthorizedException("Session invalide.");
    }
    if (dbUser.suspendedAt) {
      throw new UnauthorizedException(dbUser.suspendedReason ?? "Compte suspendu.");
    }
    if (!dbUser.emailVerifiedAt) {
      throw new UnauthorizedException("Adresse e-mail non vérifiée.");
    }

    const authUser: AuthUser = {
      userId: result.sub,
      tenantId: dbUser.tenantId,
      role: dbUser.role,
      email: dbUser.email
    };
    authUser.firstName = dbUser.firstName;
    authUser.lastName = dbUser.lastName;
    authUser.photoUrl = dbUser.photoUrl;
    return authUser;
  }

  async issueAccessToken(user: AuthUser): Promise<string> {
    return this.signAccessToken(user);
  }

  hashRefreshToken(raw: string): string {
    return this.hashToken(raw);
  }

  async sendEmailVerificationOtp(userId: string, email: string) {
    const result = await this.createAndSendOtp(
      userId,
      email,
      AuthOtpPurpose.EMAIL_VERIFICATION
    );
    return { sent: !result.exposeInResponse };
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

  private hashOtpCode(userId: string, purpose: AuthOtpPurpose, code: string) {
    return createHmac("sha256", env.API_JWT_SECRET)
      .update(`${userId}:${purpose}:${code}`)
      .digest("hex");
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

  private async getOtpTtlSeconds(): Promise<number> {
    const row = await this.prisma.client.platformSetting.findUnique({
      where: { key: OTP_TTL_SECONDS_KEY }
    });
    return parseIntSetting(row?.value, DEFAULT_OTP_TTL_SECONDS);
  }

  private async getOtpResendDelaySeconds(): Promise<number> {
    const row = await this.prisma.client.platformSetting.findUnique({
      where: { key: OTP_RESEND_DELAY_SECONDS_KEY }
    });
    return parseIntSetting(row?.value, DEFAULT_OTP_RESEND_DELAY_SECONDS);
  }

  private async createAndSendOtp(
    userId: string,
    email: string,
    purpose: AuthOtpPurpose
  ): Promise<{ code: string; exposeInResponse: boolean }> {
    const ttlSeconds = await this.getOtpTtlSeconds();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = this.hashOtpCode(userId, purpose, code);
    const now = new Date();

    await this.prisma.client.authOtpChallenge.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: now }
    });

    await this.prisma.client.authOtpChallenge.create({
      data: {
        userId,
        purpose,
        codeHash,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
        maxAttempts: OTP_MAX_ATTEMPTS,
        lastSentAt: now
      }
    });

    const ttlMinutes = Math.max(1, Math.ceil(ttlSeconds / 60));
    const isReset = purpose === AuthOtpPurpose.PASSWORD_RESET;
    const sent = await this.mail.send({
      to: [email],
      subject: isReset
        ? "Réinitialisez votre mot de passe — SHADOMA Votes"
        : "Confirmez votre adresse e-mail — SHADOMA Votes",
      html: isReset ? otpPasswordResetEmailHtml(code, ttlMinutes) : otpVerificationEmailHtml(code, ttlMinutes),
      text: isReset
        ? `Code de réinitialisation : ${code} (expire dans ${ttlMinutes} min)`
        : `Code de confirmation : ${code} (expire dans ${ttlMinutes} min)`
    });

    const exposeInResponse = !sent && env.NODE_ENV === "development";
    if (exposeInResponse) {
      this.logger.warn(`[mail:dev] OTP ${purpose} → ${email}: ${code}`);
    }

    return { code, exposeInResponse };
  }

  private async consumeOtpChallenge(challengeId: string) {
    await this.prisma.client.authOtpChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() }
    });
  }

  private async verifyAndConsumeOtpChallenge(
    userId: string,
    code: string,
    purpose: AuthOtpPurpose
  ): Promise<void> {
    const codeHash = this.hashOtpCode(userId, purpose, code);
    const provided = Buffer.from(codeHash, "utf8");

    const challenge = await this.prisma.client.authOtpChallenge.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });

    if (!challenge) {
      throw new BadRequestException("Code invalide ou expiré.");
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Code invalide ou expiré.");
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException("Trop de tentatives. Demandez un nouveau code.");
    }

    const expected = Buffer.from(challenge.codeHash, "utf8");
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!matches) {
      const updated = await this.prisma.client.authOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } }
      });
      if (updated.attempts >= updated.maxAttempts) {
        throw new BadRequestException("Trop de tentatives. Demandez un nouveau code.");
      }
      throw new BadRequestException("Code invalide ou expiré.");
    }

    await this.consumeOtpChallenge(challenge.id);
  }
}
