import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentProvider, PaymentStatus, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "../auth/auth.types";
import { isPlatformOperator } from "../auth/platform-roles";
import { PrismaService } from "../prisma/prisma.service";

const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tenantId: z.string().min(1).optional()
});

const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  email: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional()
});

const updateUserSchema = z
  .object({
    role: z.nativeEnum(UserRole).optional(),
    suspended: z.boolean().optional(),
    suspendedReason: z.string().max(500).optional()
  })
  .refine((data) => data.role !== undefined || data.suspended !== undefined, {
    message: "Indiquez un rôle ou un statut de suspension."
  });

const bulkDeleteAuditLogsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500)
});

const auditLogFilterSchema = listAuditLogsQuerySchema.omit({ limit: true, cursor: true });

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private parseOrThrow<T>(schema: z.ZodSchema<T>, value: unknown, message: string): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(message);
    }
    return parsed.data;
  }

  private buildAuditLogWhere(user: AuthUser, parsedQuery: z.infer<typeof auditLogFilterSchema>) {
    const where: Record<string, unknown> = isPlatformOperator(user.role)
      ? {
          ...(parsedQuery.tenantId ? { tenantId: parsedQuery.tenantId } : {})
        }
      : { tenantId: user.tenantId };

    if (parsedQuery.action) {
      where.action = { contains: parsedQuery.action, mode: "insensitive" };
    }
    if (parsedQuery.actorUserId) {
      where.actorUserId = parsedQuery.actorUserId;
    }
    if (parsedQuery.targetType) {
      where.targetType = parsedQuery.targetType;
    }
    if (parsedQuery.from || parsedQuery.to) {
      where.createdAt = {
        ...(parsedQuery.from ? { gte: parsedQuery.from } : {}),
        ...(parsedQuery.to ? { lte: parsedQuery.to } : {})
      };
    }

    return where;
  }

  async listAuditLogs(user: AuthUser, query: unknown) {
    const parsedQuery = this.parseOrThrow(
      listAuditLogsQuerySchema,
      query,
      "Paramètres audit invalides."
    ) as z.infer<typeof listAuditLogsQuerySchema>;
    const where = this.buildAuditLogWhere(user, parsedQuery);

    const items = parsedQuery.cursor
      ? await this.prisma.client.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          cursor: { id: parsedQuery.cursor },
          skip: 1,
          take: parsedQuery.limit + 1
        })
      : await this.prisma.client.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: parsedQuery.limit + 1
        });

    const hasMore = items.length > parsedQuery.limit;
    const pageItems = hasMore ? items.slice(0, parsedQuery.limit) : items;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;

    return {
      items: pageItems,
      nextCursor
    };
  }

  async deleteAuditLog(user: AuthUser, id: string) {
    const log = await this.prisma.client.auditLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException("Entrée d'audit introuvable.");
    }
    if (!isPlatformOperator(user.role) && log.tenantId !== user.tenantId) {
      throw new ForbiddenException("Accès refusé à cette entrée d'audit.");
    }

    await this.prisma.client.auditLog.delete({ where: { id } });
    return { deleted: true, id };
  }

  async bulkDeleteAuditLogs(user: AuthUser, payload: unknown) {
    const input = this.parseOrThrow(
      bulkDeleteAuditLogsSchema,
      payload,
      "Liste d'identifiants invalide."
    ) as z.infer<typeof bulkDeleteAuditLogsSchema>;

    const logs = await this.prisma.client.auditLog.findMany({
      where: { id: { in: input.ids } },
      select: { id: true, tenantId: true }
    });

    if (logs.length !== input.ids.length) {
      throw new NotFoundException("Certaines entrées d'audit sont introuvables.");
    }

    if (!isPlatformOperator(user.role)) {
      const foreign = logs.some((log) => log.tenantId !== user.tenantId);
      if (foreign) {
        throw new ForbiddenException("Accès refusé à certaines entrées d'audit.");
      }
    }

    const result = await this.prisma.client.auditLog.deleteMany({
      where: { id: { in: input.ids } }
    });

    return { deleted: result.count };
  }

  async deleteAuditLogsMatching(user: AuthUser, query: unknown) {
    const parsedQuery = this.parseOrThrow(
      auditLogFilterSchema,
      query,
      "Filtres de suppression invalides."
    ) as z.infer<typeof auditLogFilterSchema>;

    if (
      !isPlatformOperator(user.role) &&
      !parsedQuery.action &&
      !parsedQuery.actorUserId &&
      !parsedQuery.targetType &&
      !parsedQuery.from &&
      !parsedQuery.to &&
      !parsedQuery.tenantId
    ) {
      throw new BadRequestException(
        "Précisez au moins un filtre avant de supprimer en masse (action, acteur, cible, dates ou tenant)."
      );
    }

    const where = this.buildAuditLogWhere(user, parsedQuery);
    const result = await this.prisma.client.auditLog.deleteMany({ where });
    return { deleted: result.count };
  }

  async listUsers(user: AuthUser, query: unknown) {
    const parsedQuery = this.parseOrThrow(
      listUsersQuerySchema,
      query,
      "Paramètres utilisateurs invalides."
    ) as z.infer<typeof listUsersQuerySchema>;
    const where: Record<string, unknown> =
      isPlatformOperator(user.role)
        ? {
            ...(parsedQuery.tenantId ? { tenantId: parsedQuery.tenantId } : {}),
            ...(parsedQuery.role ? { role: parsedQuery.role } : {})
          }
        : {
            tenantId: user.tenantId,
            ...(parsedQuery.role ? { role: parsedQuery.role } : {})
          };

    if (parsedQuery.email) {
      where.email = { contains: parsedQuery.email, mode: "insensitive" };
    }

    const items = parsedQuery.cursor
      ? await this.prisma.client.user.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          cursor: { id: parsedQuery.cursor },
          skip: 1,
          take: parsedQuery.limit + 1
        })
      : await this.prisma.client.user.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: parsedQuery.limit + 1
        });

    const hasMore = items.length > parsedQuery.limit;
    const pageItems = hasMore ? items.slice(0, parsedQuery.limit) : items;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;

    return {
      items: pageItems.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        email: item.email,
        role: item.role,
        suspendedAt: item.suspendedAt?.toISOString() ?? null,
        suspendedReason: item.suspendedReason ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      })),
      nextCursor
    };
  }

  async updateUser(actor: AuthUser, userId: string, payload: unknown) {
    const input = this.parseOrThrow(updateUserSchema, payload, "Mise à jour utilisateur invalide.") as z.infer<
      typeof updateUserSchema
    >;

    if (actor.userId === userId) {
      throw new BadRequestException("Vous ne pouvez pas modifier votre propre compte depuis cette interface.");
    }

    const target = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new NotFoundException("Utilisateur introuvable.");
    }

    const touchesPlatformRole =
      input.role === UserRole.PLATFORM_ADMIN ||
      input.role === UserRole.PLATFORM_SUPER_ADMIN ||
      target.role === UserRole.PLATFORM_ADMIN ||
      target.role === UserRole.PLATFORM_SUPER_ADMIN;
    if (touchesPlatformRole && actor.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        "Seul un super-admin peut attribuer ou modifier un rôle plateforme."
      );
    }

    const data: {
      role?: UserRole;
      suspendedAt?: Date | null;
      suspendedReason?: string | null;
    } = {};

    if (input.role !== undefined) {
      data.role = input.role;
    }

    if (input.suspended === true) {
      data.suspendedAt = new Date();
      data.suspendedReason = input.suspendedReason?.trim() || "Suspendu par un opérateur plateforme.";
    } else if (input.suspended === false) {
      data.suspendedAt = null;
      data.suspendedReason = null;
    } else if (input.suspendedReason !== undefined && target.suspendedAt) {
      data.suspendedReason = input.suspendedReason.trim() || null;
    }

    const updated = await this.prisma.client.user.update({
      where: { id: userId },
      data
    });

    if (input.suspended === true) {
      await this.prisma.client.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: target.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: input.suspended === true ? "user.suspended" : input.suspended === false ? "user.unsuspended" : "user.role_updated",
        targetType: "User",
        targetId: userId,
        metadata: {
          email: target.email,
          previousRole: target.role,
          newRole: updated.role,
          suspended: updated.suspendedAt !== null
        }
      }
    });

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      email: updated.email,
      role: updated.role,
      suspendedAt: updated.suspendedAt?.toISOString() ?? null,
      suspendedReason: updated.suspendedReason ?? null,
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  async getJobsOverview(user: AuthUser) {
    const now = Date.now();
    const stalePendingBefore = new Date(now - 15 * 60 * 1000);
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const cleanupBefore = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const tenantFilter = isPlatformOperator(user.role) ? {} : { tenantId: user.tenantId };

    const [pendingPayments, stalePendingPayments, failedPayments24h, expiredIdempotencyKeys, revokedSessionsToPurge, recentMaintenanceRuns] =
      await Promise.all([
        this.prisma.client.paymentTransaction.count({
          where: {
            ...tenantFilter,
            status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] }
          }
        }),
        this.prisma.client.paymentTransaction.count({
          where: {
            ...tenantFilter,
            status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] },
            createdAt: { lt: stalePendingBefore }
          }
        }),
        this.prisma.client.paymentTransaction.count({
          where: {
            ...tenantFilter,
            status: PaymentStatus.FAILED,
            updatedAt: { gte: last24h }
          }
        }),
        // IdempotencyKey is a global table with no tenant column, so its count
        // must NOT be exposed to an organizer (cross-tenant signal leak). Only
        // PLATFORM_ADMIN sees the real figure; organizers always get 0.
        isPlatformOperator(user.role)
          ? this.prisma.client.idempotencyKey.count({
              where: { expiresAt: { lt: new Date(now) } }
            })
          : Promise.resolve(0),
        this.prisma.client.authSession.count({
          where: {
            ...(isPlatformOperator(user.role) ? {} : { tenantId: user.tenantId }),
            revokedAt: { not: null, lt: cleanupBefore }
          }
        }),
        this.prisma.client.auditLog.findMany({
          where: {
            ...tenantFilter,
            action: { startsWith: "maintenance." }
          },
          orderBy: { createdAt: "desc" },
          take: 5
        })
      ]);

    return {
      pendingPayments,
      stalePendingPayments,
      failedPayments24h,
      expiredIdempotencyKeys,
      revokedSessionsToPurge,
      recentMaintenanceRuns: recentMaintenanceRuns.map((item) => ({
        id: item.id,
        action: item.action,
        createdAt: item.createdAt.toISOString(),
        actorUserId: item.actorUserId
      }))
    };
  }

  // ── User Detail ──────────────────────────────────────────────────────

  async getUserDetail(actor: AuthUser, userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: { id: true, slug: true, displayName: true, provider: true }
        },
        sessions: { select: { id: true, createdAt: true, expiresAt: true, revokedAt: true } }
      }
    });
    if (!user) {
      throw new NotFoundException("Utilisateur introuvable.");
    }

    const voteCount = await this.prisma.client.vote.count({
      where: { tenantId: user.tenantId }
    });
    const paidVoteCount = await this.prisma.client.vote.count({
      where: { tenantId: user.tenantId, paidAt: { not: null }, cancelledAt: null }
    });
    const eventCount = await this.prisma.client.event.count({
      where: { tenantId: user.tenantId }
    });
    const activeEventCount = await this.prisma.client.event.count({
      where: { tenantId: user.tenantId, status: "ACTIVE" }
    });
    const revenueResult = await this.prisma.client.paymentTransaction.aggregate({
      where: { tenantId: user.tenantId, status: PaymentStatus.SUCCEEDED },
      _sum: { amountCfa: true }
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      suspendedReason: user.suspendedReason ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      stats: {
        totalVotes: voteCount,
        paidVotes: paidVoteCount,
        totalEvents: eventCount,
        activeEvents: activeEventCount,
        totalRevenueCfa: revenueResult._sum.amountCfa ?? 0
      },
      sessions: user.sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null
      }))
    };
  }

  async deleteUser(actor: AuthUser, userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Utilisateur introuvable.");
    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException("Impossible de supprimer un super-admin.");
    }

    // Delete tenant (cascades to events, votes, payments)
    await this.prisma.client.tenant.delete({ where: { id: user.tenantId } });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "user.deleted",
        targetType: "User",
        targetId: userId,
        metadata: { email: user.email, tenantId: user.tenantId }
      }
    });

    return { deleted: true, email: user.email };
  }

  async setUserPaymentProvider(actor: AuthUser, userId: string, body: { provider: string }) {
    const provider = body.provider as PaymentProvider;
    if (!Object.values(PaymentProvider).includes(provider)) {
      throw new BadRequestException("Fournisseur de paiement invalide.");
    }
    if (provider !== PaymentProvider.FEEXPAY && provider !== PaymentProvider.FEDAPAY) {
      throw new BadRequestException("Choisissez FeexPay ou FedaPay.");
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { tenant: { select: { provider: true } } }
    });
    if (!user) throw new NotFoundException("Utilisateur introuvable.");

    const updated = await this.prisma.client.tenant.update({
      where: { id: user.tenantId },
      data: { provider }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "user.provider_updated",
        targetType: "User",
        targetId: userId,
        metadata: { email: user.email, previousProvider: user.tenant?.provider, newProvider: provider }
      }
    });

    return { provider: updated.provider };
  }

  // ── Display Partners ─────────────────────────────────────────────────

  async listDisplayPartners() {
    return this.prisma.client.displayPartner.findMany({
      orderBy: { sortOrder: "asc" }
    });
  }

  async createDisplayPartner(actor: AuthUser, body: unknown) {
    const schema = z.object({
      name: z.string().min(1).max(200),
      logoUrl: z.string().url(),
      websiteUrl: z.string().url().optional().or(z.literal("")),
      sortOrder: z.coerce.number().int().min(0).default(0),
      active: z.boolean().default(true)
    });
    const input = schema.parse(body);

    const partner = await this.prisma.client.displayPartner.create({ data: { ...input, websiteUrl: input.websiteUrl || null } });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "display_partner.created",
        targetType: "DisplayPartner",
        targetId: partner.id,
        metadata: { name: partner.name }
      }
    });

    return partner;
  }

  async updateDisplayPartner(actor: AuthUser, id: string, body: unknown) {
    const existing = await this.prisma.client.displayPartner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Partenaire introuvable.");

    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      logoUrl: z.string().url().optional(),
      websiteUrl: z.string().url().optional().nullable().or(z.literal("")),
      sortOrder: z.coerce.number().int().min(0).optional(),
      active: z.boolean().optional()
    });
    const input = schema.parse(body);

    const updateData = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined)
    );
    const updated = await this.prisma.client.displayPartner.update({ where: { id }, data: updateData });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "display_partner.updated",
        targetType: "DisplayPartner",
        targetId: id,
        metadata: { name: updated.name }
      }
    });

    return updated;
  }

  async deleteDisplayPartner(actor: AuthUser, id: string) {
    const existing = await this.prisma.client.displayPartner.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Partenaire introuvable.");

    await this.prisma.client.displayPartner.delete({ where: { id } });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "display_partner.deleted",
        targetType: "DisplayPartner",
        targetId: id,
        metadata: { name: existing.name }
      }
    });

    return { deleted: true };
  }

  // ── Admin Management ─────────────────────────────────────────────────

  async listAdmins(_actor: AuthUser) {
    const admins = await this.prisma.client.user.findMany({
      where: { role: { in: [UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN] } },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        tenant: { select: { slug: true, displayName: true } }
      },
      orderBy: { createdAt: "asc" }
    });

    return admins.map((a) => ({
      id: a.id,
      email: a.email,
      role: a.role,
      createdAt: a.createdAt.toISOString(),
      emailVerifiedAt: a.emailVerifiedAt?.toISOString() ?? null,
      suspendedAt: a.suspendedAt?.toISOString() ?? null,
      tenant: a.tenant
    }));
  }

  async addAdmin(actor: AuthUser, body: { email: string; password: string }) {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(10).max(128)
    });
    const input = schema.parse(body);

    // Find or create platform tenant
    let platformTenant = await this.prisma.client.tenant.findUnique({
      where: { slug: "shadoma-platform" }
    });
    if (!platformTenant) {
      platformTenant = await this.prisma.client.tenant.create({
        data: { slug: "shadoma-platform", displayName: "SHADOMA Votes (Plateforme)" }
      });
    }

    const existing = await this.prisma.client.user.findUnique({
      where: { tenantId_email: { tenantId: platformTenant.id, email: input.email } }
    });
    if (existing) {
      throw new BadRequestException("Un administrateur avec cet email existe déjà.");
    }

    const passwordHash = await hash(input.password, 12);
    const user = await this.prisma.client.user.create({
      data: {
        tenantId: platformTenant.id,
        email: input.email,
        passwordHash,
        role: UserRole.PLATFORM_ADMIN,
        emailVerifiedAt: new Date()
      }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: platformTenant.id,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "admin.added",
        targetType: "User",
        targetId: user.id,
        metadata: { email: input.email }
      }
    });

    return { id: user.id, email: user.email, role: user.role };
  }

  async updateAdminEmail(actor: AuthUser, userId: string, body: { email: string }) {
    const email = z.string().email().parse(body.email);
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Administrateur introuvable.");
    if (!isPlatformOperator(user.role)) {
      throw new BadRequestException("Cet utilisateur n'est pas un administrateur.");
    }

    const updated = await this.prisma.client.user.update({
      where: { id: userId },
      data: { email }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "admin.email_updated",
        targetType: "User",
        targetId: userId,
        metadata: { previousEmail: user.email, newEmail: email }
      }
    });

    return { id: updated.id, email: updated.email };
  }

  async updateAdminPassword(actor: AuthUser, userId: string, body: { password: string }) {
    const password = z.string().min(10).max(128).parse(body.password);
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Administrateur introuvable.");
    if (!isPlatformOperator(user.role)) {
      throw new BadRequestException("Cet utilisateur n'est pas un administrateur.");
    }

    const passwordHash = await hash(password, 12);
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "admin.password_updated",
        targetType: "User",
        targetId: userId
      }
    });

    return { updated: true };
  }

  // ── API Keys ─────────────────────────────────────────────────────────

  async listApiKeys(_actor: AuthUser) {
    const keys = await this.prisma.client.adminApiKey.findMany({
      orderBy: { createdAt: "desc" }
    });
    return keys.map((k) => ({
      id: k.id,
      label: k.label,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString()
    }));
  }

  async createApiKey(actor: AuthUser, body: { label: string }) {
    const label = z.string().min(1).max(100).parse(body.label);
    const rawKey = `sv_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    const apiKey = await this.prisma.client.adminApiKey.create({
      data: { label, keyHash, keyPrefix, createdByUserId: actor.userId }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "api_key.created",
        targetType: "AdminApiKey",
        targetId: apiKey.id,
        metadata: { label }
      }
    });

    return {
      id: apiKey.id,
      label: apiKey.label,
      keyPrefix: apiKey.keyPrefix,
      // Only shown once at creation
      rawKey
    };
  }

  async revokeApiKey(actor: AuthUser, id: string) {
    const key = await this.prisma.client.adminApiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException("Clé API introuvable.");
    if (key.revokedAt) {
      throw new BadRequestException("Cette clé est déjà révoquée.");
    }

    await this.prisma.client.adminApiKey.update({
      where: { id },
      data: { revokedAt: new Date() }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "api_key.revoked",
        targetType: "AdminApiKey",
        targetId: id,
        metadata: { label: key.label }
      }
    });

    return { revoked: true, id };
  }
}
