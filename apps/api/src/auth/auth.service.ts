import { ConflictException, BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { AuthOtpPurpose, InvitationStatus, UserRole, type Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { SignJWT, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { otpContractSignatureEmailHtml, otpPasswordResetEmailHtml, otpVerificationEmailHtml } from "./auth-email.util";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../privacy/privacy-policy";
import {
  DEFAULT_OTP_RESEND_DELAY_SECONDS,
  DEFAULT_OTP_TTL_SECONDS,
  OTP_RESEND_DELAY_SECONDS_KEY,
  OTP_TTL_SECONDS_KEY,
  parseIntSetting
} from "../common/platform-settings";
import { generateSecureEventSlug } from "../common/secure-event-slug";
import { normalizePayinPhone } from "../common/mobile-operator";
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

// Inscription : uniquement ce qui sert au compte. Les informations du contrat
// (adresse, pièce d'identité…) sont demandées au moment de signer.
const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(8).max(30),
    email: z.string().trim().email(),
    password: strongPasswordSchema,
    passwordConfirm: z.string().optional(),
    // Nom public de l'organisation ; par défaut « Prénom Nom ».
    organizationName: z.string().trim().min(2).max(120).optional(),
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

/** Contenu attendu d'un jeton d'accès. */
const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  tenantId: z.string().min(1),
  role: z.nativeEnum(UserRole),
  email: z.string().email(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable()
});

// Un cookie tout juste tourné, renvoyé par une requête parallèle ou un autre
// onglet, n'est pas une réutilisation frauduleuse.
const REFRESH_ROTATION_GRACE_MS = 10_000;

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

  /**
   * Réserve une tentative AVANT de vérifier le mot de passe : le compteur est
   * incrémenté atomiquement (INSERT … ON CONFLICT), donc des requêtes parallèles
   * ne testent jamais plus de MAX_LOGIN_ATTEMPTS mots de passe.
   */
  private async reserveLoginAttempt(tenantSlug: string, email: string) {
    const identifier = this.getAttemptKey(tenantSlug, email);
    const row = await this.prisma.client.loginAttempt.upsert({
      where: { identifier },
      create: { identifier, count: 1 },
      update: { count: { increment: 1 } }
    });
    if (row.count > MAX_LOGIN_ATTEMPTS) {
      await this.lockLogin(identifier);
      throw new UnauthorizedException(
        `Compte temporairement verrouillé. Réessayez dans ${Math.ceil(LOCKOUT_DURATION_MS / 1000)} secondes.`
      );
    }
  }

  /** Échec confirmé : la tentative est déjà comptée, on verrouille au seuil. */
  private async recordFailedLogin(tenantSlug: string, email: string) {
    const identifier = this.getAttemptKey(tenantSlug, email);
    const row = await this.prisma.client.loginAttempt.findUnique({ where: { identifier } });
    if (row && row.count >= MAX_LOGIN_ATTEMPTS) {
      await this.lockLogin(identifier);
    }
  }

  private async lockLogin(identifier: string) {
    await this.prisma.client.loginAttempt.updateMany({
      where: { identifier, lockedUntil: null },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) }
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
      .catch((error: unknown) => this.logAuditFailure(error));
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
      .catch((error: unknown) => this.logAuditFailure(error));
  }

  /** Trace d'authentification non écrite : jamais bloquant, mais jamais silencieux. */
  private logAuditFailure(error: unknown): void {
    this.logger.error(`Trace d'audit d'authentification non écrite : ${error instanceof Error ? error.message : String(error)}`);
  }

  async register(payload: unknown, meta?: SessionMeta) {
    const input = registerSchema.parse(payload);
    const normalizedEmail = input.email.toLowerCase();
    const phone = normalizePayinPhone(input.phone);

    // Un email = un compte sur toute la plateforme : la connexion se fait par
    // email seul, et une adresse rattachée à deux organisations serait ambiguë.
    const existingUser = await this.prisma.client.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true }
    });
    if (existingUser) {
      throw new ConflictException("Un compte existe déjà avec cette adresse email. Connectez-vous ou réinitialisez votre mot de passe.");
    }

    // SECURITY: registration always provisions a NEW tenant (never attaches to
    // an existing one). Its public slug is generated, never chosen.
    const displayName = input.organizationName ?? `${input.firstName} ${input.lastName}`;
    let tenant: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !tenant; attempt += 1) {
      tenant = await this.prisma.client.tenant
        .create({ data: { slug: generateSecureEventSlug(displayName), displayName }, select: { id: true } })
        .catch((error: unknown) => {
          if (isUniqueConstraintViolation(error)) return null;
          throw error;
        });
    }
    if (!tenant) {
      throw new ConflictException("Impossible de créer votre espace. Réessayez.");
    }
    await this.prisma.client.organizerWallet.create({ data: { tenantId: tenant.id } });

    const passwordHash = await hash(input.password, 12);
    const user = await this.prisma.client.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        role: UserRole.ORGANIZER_OWNER,
        firstName: input.firstName,
        lastName: input.lastName,
        phone,
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
    // The caller just created this account, so reporting the failure leaks
    // nothing. resendOtp/forgotPassword keep their anti-enumeration message.
    if (!otpResult.sent && env.NODE_ENV === "production") {
      throw new ServiceUnavailableException(
        "Le compte est créé, mais l'e-mail de confirmation n'a pas pu partir. Demandez un nouveau code dans quelques minutes."
      );
    }
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
    await this.reserveLoginAttempt(normalizedSlug, normalizedEmail);

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
    // Mot de passe juste : la tentative réservée ne compte pas comme un échec.
    await this.clearLoginAttempts(normalizedSlug, normalizedEmail);

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

  async refresh(payload: unknown, meta?: SessionMeta): Promise<{ accessToken: string; refreshToken?: string }> {
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
      // Même cookie envoyé par une requête parallèle ou un autre onglet juste
      // après sa rotation : accès accordé, sans nouvelle session ni révocation.
      if (await this.isConcurrentRotation(session.id, session.revokedAt)) {
        return { accessToken: await this.signAccessToken(await this.refreshableUser(session.userId)) };
      }
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
        .catch((error: unknown) => this.logAuditFailure(error));
      throw new UnauthorizedException("Session révoquée (réutilisation détectée).");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Session invalide ou expirée.");
    }

    const authUser = await this.refreshableUser(session.userId);
    const accessToken = await this.signAccessToken(authUser);

    // Rotation atomique : une seule requête révoque ce cookie et en reçoit un nouveau.
    const claimed = await this.prisma.client.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (claimed.count === 0) {
      return { accessToken };
    }
    const { refreshToken } = await this.createSession(authUser, session.id, meta);

    return { accessToken, refreshToken };
  }

  /** Rotation faite il y a moins de REFRESH_ROTATION_GRACE_MS (une déconnexion n'en ouvre pas). */
  private async isConcurrentRotation(sessionId: string, revokedAt: Date): Promise<boolean> {
    if (Date.now() - revokedAt.getTime() > REFRESH_ROTATION_GRACE_MS) return false;
    const successor = await this.prisma.client.authSession.count({ where: { rotatedFromSessionId: sessionId } });
    return successor > 0;
  }

  private async refreshableUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId }
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
    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl
    };
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
    // Une seule acceptation, même en cas de double clic : l'invitation est
    // réclamée atomiquement, dans la même transaction que la création du compte.
    const user = await this.prisma.client.$transaction(async (trx) => {
      const claimed = await trx.invitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() }
      });
      if (claimed.count === 0) {
        throw new ConflictException("Cette invitation a déjà été utilisée.");
      }
      const created = await trx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email: invitation.email,
          passwordHash,
          role: invitation.role,
          emailVerifiedAt: new Date()
        }
      });
      await trx.auditLog.create({
        data: {
          tenantId: invitation.tenantId,
          actorUserId: created.id,
          actorRole: created.role,
          action: "invitation.accepted",
          targetType: "User",
          targetId: created.id,
          metadata: { invitationId: invitation.id }
        }
      });
      return created;
    });
    // Notification annexe : un échec ne doit ni bloquer l'acceptation ni rester une promesse rejetée non gérée.
    void this.notifications
      .create(invitation.tenantId, "INVITATION_ACCEPTED", { email: invitation.email })
      .catch((error: unknown) => {
        this.logger.warn(`Notification d'invitation acceptée non créée : ${error instanceof Error ? error.message : String(error)}`);
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
    const attempt = await this.claimOtpAttempt(challenge);

    const expected = Buffer.from(challenge.codeHash, "utf8");
    const provided = Buffer.from(
      this.hashOtpCode(user.id, input.purpose, input.code),
      "utf8"
    );
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!matches) {
      await this.auditOtp(
        "auth.otp_failed",
        user.tenantId,
        user.id,
        user.role,
        input.purpose,
        meta
      );
      if (attempt.exhausted) {
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
    // Jeton expiré, falsifié ou mal formé : toujours 401 (jamais 500). Le front
    // rafraîchit alors la session et rejoue la requête.
    let result: z.infer<typeof accessTokenClaimsSchema>;
    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });
      result = accessTokenClaimsSchema.parse(payload);
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof joseErrors.JWTExpired ? "Session expirée : reconnexion en cours." : "Session invalide."
      );
    }

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

  /**
   * Code à 6 chiffres envoyé à l'email du compte pour confirmer une signature de
   * contrat. Il prouve le contrôle de la boîte mail du compte au moment de la
   * signature — pas l'identité civile du signataire. Hors production, si aucun
   * email ne part, le code est renvoyé pour permettre les essais.
   */
  async sendContractSignatureCode(userId: string, email: string, eventTitle: string) {
    const result = await this.createAndSendOtp(userId, email, AuthOtpPurpose.CONTRACT_SIGNATURE, eventTitle);
    const exposeCode = !result.sent && env.NODE_ENV !== "production";
    if (!result.sent && env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("Le code de signature n'a pas pu être envoyé. Réessayez dans quelques minutes.");
    }
    return { sent: result.sent, ...(exposeCode ? { devCode: result.code } : {}) };
  }

  /**
   * Vérifie le code de signature (essais limités, expiration) SANS le consommer :
   * la consommation se fait dans la transaction de signature
   * (`consumeOtpChallengeOnce`), pour qu'un échec de signature ne brûle pas le code.
   */
  async checkContractSignatureCode(userId: string, code: string): Promise<string> {
    return this.verifyOtpChallenge(userId, code, AuthOtpPurpose.CONTRACT_SIGNATURE);
  }

  /** Consomme un code une seule fois : de deux validations concurrentes, une seule réussit. */
  async consumeOtpChallengeOnce(challengeId: string, db: Pick<Prisma.TransactionClient, "authOtpChallenge"> = this.prisma.client): Promise<void> {
    const consumed = await db.authOtpChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() }
    });
    if (consumed.count === 0) {
      throw new BadRequestException("Code invalide ou expiré.");
    }
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
    purpose: AuthOtpPurpose,
    eventTitle = ""
  ): Promise<{ code: string; sent: boolean; exposeInResponse: boolean }> {
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
    const message =
      purpose === AuthOtpPurpose.PASSWORD_RESET
        ? {
            subject: "Réinitialisez votre mot de passe — SHADOMA Votes",
            html: otpPasswordResetEmailHtml(code, ttlMinutes),
            text: `Code de réinitialisation : ${code} (expire dans ${ttlMinutes} min)`
          }
        : purpose === AuthOtpPurpose.CONTRACT_SIGNATURE
          ? {
              subject: "Code de signature de votre contrat — SHADOMA Votes",
              html: otpContractSignatureEmailHtml(code, ttlMinutes, eventTitle),
              text: `Code de signature du contrat : ${code} (expire dans ${ttlMinutes} min)`
            }
          : {
              subject: "Confirmez votre adresse e-mail — SHADOMA Votes",
              html: otpVerificationEmailHtml(code, ttlMinutes),
              text: `Code de confirmation : ${code} (expire dans ${ttlMinutes} min)`
            };
    const sent = await this.mail.send({ to: [email], ...message });

    const exposeInResponse = !sent && env.NODE_ENV === "development";
    if (exposeInResponse) {
      this.logger.warn(`[mail:dev] OTP ${purpose} → ${email}: ${code}`);
    } else if (!sent && env.NODE_ENV === "production") {
      this.logger.error(`OTP ${purpose} non envoyé (utilisateur ${userId}) : échec du fournisseur e-mail.`);
    }

    return { code, sent, exposeInResponse };
  }

  private async consumeOtpChallenge(challengeId: string) {
    await this.consumeOtpChallengeOnce(challengeId);
  }

  /**
   * Réserve un essai sur un défi : l'incrément est conditionné au compteur, donc
   * des requêtes parallèles ne dépassent jamais `maxAttempts`. `exhausted` indique
   * que cet essai était le dernier autorisé.
   */
  private async claimOtpAttempt(challenge: { id: string; attempts: number; maxAttempts: number }): Promise<{ exhausted: boolean }> {
    const claimed = await this.prisma.client.authOtpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: challenge.maxAttempts } },
      data: { attempts: { increment: 1 } }
    });
    if (claimed.count === 0) {
      throw new BadRequestException("Trop de tentatives. Demandez un nouveau code.");
    }
    return { exhausted: challenge.attempts + 1 >= challenge.maxAttempts };
  }

  /** Vérifie un code (essais comptés, expiration) et renvoie l'identifiant du défi, sans le consommer. */
  private async verifyOtpChallenge(userId: string, code: string, purpose: AuthOtpPurpose): Promise<string> {
    const provided = Buffer.from(this.hashOtpCode(userId, purpose, code), "utf8");

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
    const attempt = await this.claimOtpAttempt(challenge);

    const expected = Buffer.from(challenge.codeHash, "utf8");
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);
    if (!matches) {
      if (attempt.exhausted) {
        throw new BadRequestException("Trop de tentatives. Demandez un nouveau code.");
      }
      throw new BadRequestException("Code invalide ou expiré.");
    }
    return challenge.id;
  }

  private async verifyAndConsumeOtpChallenge(userId: string, code: string, purpose: AuthOtpPurpose): Promise<void> {
    const challengeId = await this.verifyOtpChallenge(userId, code, purpose);
    await this.consumeOtpChallengeOnce(challengeId);
  }
}
