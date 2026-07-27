import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../../auth/auth.types";
import { PrismaService } from "../../prisma/prisma.service";

// ---------------------------------------------------------------------------
// Schemas de validation pour la gestion des Plans d'abonnement
// ---------------------------------------------------------------------------

const createPlanSchema = z.object({
    name: z.string().min(2).max(80),
    slug: z.string().min(2).max(80).regex(/^[a-z0-9_-]+$/, "Le slug doit être en minuscules, sans espaces."),
    description: z.string().min(2).max(500).optional(),
    priceCfa: z.number().int().min(0).max(10_000_000).default(0),
    maxEvents: z.number().int().min(1).max(10_000).nullable().optional(),
    commissionRate: z.number().int().min(0).max(10_000).default(1500), // bps, 0-100%
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    features: z.array(z.string()).optional()
});

const updatePlanSchema = z.object({
    name: z.string().min(2).max(80).optional(),
    slug: z.string().min(2).max(80).regex(/^[a-z0-9_-]+$/, "Le slug doit être en minuscules, sans espaces.").optional(),
    description: z.string().min(2).max(500).optional(),
    priceCfa: z.number().int().min(0).max(10_000_000).optional(),
    maxEvents: z.number().int().min(1).max(10_000).nullable().optional(),
    commissionRate: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    features: z.array(z.string()).optional()
});

@Injectable()
export class PlansService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Vérifie que l'utilisateur est un admin plateforme.
     */
    private assertAdmin(user: AuthUser): void {
        if (user.role !== UserRole.PLATFORM_ADMIN && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
            throw new ForbiddenException("Réservé aux administrateurs de la plateforme.");
        }
    }

    /**
     * Liste tous les plans (admin). Retourne aussi les plans inactifs.
     */
    async listAll(user: AuthUser) {
        this.assertAdmin(user);
        return this.prisma.client.plan.findMany({
            orderBy: { sortOrder: "asc" }
        });
    }

    /**
     * Liste les plans actifs uniquement (public).
     */
    async listActive() {
        return this.prisma.client.plan.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: "asc" }
        });
    }

    /**
     * Récupère un plan par son ID.
     */
    async getById(user: AuthUser, id: string) {
        this.assertAdmin(user);
        const plan = await this.prisma.client.plan.findUnique({ where: { id } });
        if (!plan) {
            throw new NotFoundException("Plan introuvable.");
        }
        return plan;
    }

    /**
     * Crée un nouveau plan d'abonnement.
     */
    async create(user: AuthUser, payload: unknown) {
        this.assertAdmin(user);
        const data = createPlanSchema.parse(payload);

        // Vérifier l'unicité du slug
        const existingSlug = await this.prisma.client.plan.findUnique({
            where: { slug: data.slug }
        });
        if (existingSlug) {
            throw new BadRequestException("Ce slug est déjà utilisé.");
        }

        // Vérifier l'unicité du nom
        const existingName = await this.prisma.client.plan.findUnique({
            where: { name: data.name }
        });
        if (existingName) {
            throw new BadRequestException("Ce nom est déjà utilisé.");
        }

        const plan = await this.prisma.client.plan.create({
            data: {
                name: data.name,
                slug: data.slug,
                description: data.description ?? null,
                priceCfa: data.priceCfa,
                maxEvents: data.maxEvents ?? null,
                commissionRate: data.commissionRate,
                isActive: data.isActive,
                sortOrder: data.sortOrder,
                features: data.features ?? null
            }
        });

        await this.prisma.client.auditLog.create({
            data: {
                tenantId: user.tenantId,
                actorUserId: user.userId,
                actorRole: user.role,
                action: "plan.created",
                targetType: "Plan",
                targetId: plan.id,
                metadata: {
                    name: plan.name,
                    slug: plan.slug,
                    priceCfa: plan.priceCfa,
                    commissionRate: plan.commissionRate,
                    maxEvents: plan.maxEvents
                }
            }
        });

        return plan;
    }

    /**
     * Met à jour un plan existant.
     */
    async update(user: AuthUser, id: string, payload: unknown) {
        this.assertAdmin(user);
        const existing = await this.prisma.client.plan.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException("Plan introuvable.");
        }

        const data = updatePlanSchema.parse(payload);

        // Vérifier l'unicité du slug si modifié
        if (data.slug && data.slug !== existing.slug) {
            const slugExists = await this.prisma.client.plan.findUnique({
                where: { slug: data.slug }
            });
            if (slugExists) {
                throw new BadRequestException("Ce slug est déjà utilisé.");
            }
        }

        // Vérifier l'unicité du nom si modifié
        if (data.name && data.name !== existing.name) {
            const nameExists = await this.prisma.client.plan.findUnique({
                where: { name: data.name }
            });
            if (nameExists) {
                throw new BadRequestException("Ce nom est déjà utilisé.");
            }
        }

        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.slug !== undefined) updateData.slug = data.slug;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.priceCfa !== undefined) updateData.priceCfa = data.priceCfa;
        if (data.maxEvents !== undefined) updateData.maxEvents = data.maxEvents;
        if (data.commissionRate !== undefined) updateData.commissionRate = data.commissionRate;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
        if (data.features !== undefined) updateData.features = data.features;

        const plan = await this.prisma.client.plan.update({
            where: { id },
            data: updateData
        });

        await this.prisma.client.auditLog.create({
            data: {
                tenantId: user.tenantId,
                actorUserId: user.userId,
                actorRole: user.role,
                action: "plan.updated",
                targetType: "Plan",
                targetId: plan.id,
                metadata: {
                    previous: {
                        name: existing.name,
                        priceCfa: existing.priceCfa,
                        commissionRate: existing.commissionRate,
                        maxEvents: existing.maxEvents,
                        isActive: existing.isActive
                    },
                    current: {
                        name: plan.name,
                        priceCfa: plan.priceCfa,
                        commissionRate: plan.commissionRate,
                        maxEvents: plan.maxEvents,
                        isActive: plan.isActive
                    }
                }
            }
        });

        return plan;
    }

    /**
     * Supprime un plan. Protégé : on ne peut pas supprimer un plan qui a des
     * abonnements actifs liés.
     */
    async delete(user: AuthUser, id: string) {
        this.assertAdmin(user);
        const plan = await this.prisma.client.plan.findUnique({
            where: { id },
            include: { _count: { select: { subscriptions: true } } }
        });
        if (!plan) {
            throw new NotFoundException("Plan introuvable.");
        }

        if (plan._count.subscriptions > 0) {
            // Désactiver plutôt que supprimer (les abonnements existants font référence au plan)
            await this.prisma.client.plan.update({
                where: { id },
                data: { isActive: false }
            });

            await this.prisma.client.auditLog.create({
                data: {
                    tenantId: user.tenantId,
                    actorUserId: user.userId,
                    actorRole: user.role,
                    action: "plan.deactivated",
                    targetType: "Plan",
                    targetId: id,
                    metadata: {
                        name: plan.name,
                        slug: plan.slug,
                        reason: "Plan désactivé car il a des abonnements actifs."
                    }
                }
            });

            return { deleted: false, deactivated: true, id: plan.id, name: plan.name };
        }

        await this.prisma.client.plan.delete({ where: { id } });

        await this.prisma.client.auditLog.create({
            data: {
                tenantId: user.tenantId,
                actorUserId: user.userId,
                actorRole: user.role,
                action: "plan.deleted",
                targetType: "Plan",
                targetId: id,
                metadata: { name: plan.name, slug: plan.slug }
            }
        });

        return { deleted: true, id: plan.id, name: plan.name };
    }

    /**
     * Récupère le plan Free (par défaut pour les nouveaux inscrits).
     * Si aucun plan Free n'existe, retourne null.
     */
    async getFreePlan() {
        return this.prisma.client.plan.findFirst({
            where: { slug: "free", isActive: true }
        });
    }

    /**
     * Résout la commission associée à un tenant via son abonnement actif.
     * Retourne le taux en basis points (bps) ou null si aucun abonnement actif.
     */
    async resolveCommissionBpsForTenant(tenantId: string): Promise<number | null> {
        const activeSub = await this.prisma.client.accountSubscription.findFirst({
            where: {
                tenantId,
                status: "ACTIVE" as any,
                expiresAt: { gt: new Date() }
            },
            orderBy: { expiresAt: "desc" },
            include: { plan: true }
        });

        if (activeSub?.plan) {
            return activeSub.plan.commissionRate;
        }

        // Fallback: utiliser frozenCommissionBps si pas de plan lié (rétrocompatibilité)
        if (activeSub) {
            return activeSub.frozenCommissionBps;
        }

        return null;
    }

    /**
     * Vérifie si un tenant peut créer un événement selon son plan.
     * Retourne { allowed, reason } où reason est un message si bloqué.
     */
    async canCreateEvent(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
        const activeSub = await this.prisma.client.accountSubscription.findFirst({
            where: {
                tenantId,
                status: "ACTIVE" as any,
                expiresAt: { gt: new Date() }
            },
            orderBy: { expiresAt: "desc" },
            include: { plan: true }
        });

        // Pas d'abonnement actif → bloqué
        if (!activeSub) {
            return {
                allowed: false,
                reason: "Abonnement requis pour créer un évènement. Souscrivez un plan Standard ou demandez un partenariat."
            };
        }

        // Si le plan a maxEvents défini, vérifier la limite
        const maxEvents = activeSub.plan?.maxEvents ?? null;
        if (maxEvents !== null) {
            const currentEventCount = await this.prisma.client.event.count({
                where: { tenantId }
            });

            if (currentEventCount >= maxEvents) {
                return {
                    allowed: false,
                    reason: `Vous avez atteint la limite de ${maxEvents} événement(s) de votre plan ${activeSub.plan?.name ?? "actuel"}. Passez à un plan supérieur pour créer plus d'événements.`
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Retourne les statistiques d'utilisation pour un tenant (events used / limit).
     */
    async getUsageStats(tenantId: string) {
        const activeSub = await this.prisma.client.accountSubscription.findFirst({
            where: {
                tenantId,
                status: "ACTIVE" as any,
                expiresAt: { gt: new Date() }
            },
            orderBy: { expiresAt: "desc" },
            include: { plan: true }
        });

        if (!activeSub) {
            return { hasSubscription: false, planName: null, eventsUsed: 0, eventsLimit: null };
        }

        const eventsUsed = await this.prisma.client.event.count({
            where: { tenantId }
        });

        return {
            hasSubscription: true,
            planId: activeSub.planId,
            planName: activeSub.plan?.name ?? null,
            planSlug: activeSub.plan?.slug ?? null,
            commissionRate: activeSub.plan?.commissionRate ?? activeSub.frozenCommissionBps,
            eventsUsed,
            eventsLimit: activeSub.plan?.maxEvents ?? null, // null = illimité
            expiresAt: activeSub.expiresAt.toISOString(),
            daysRemaining: Math.max(0, Math.ceil(
                (activeSub.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            ))
        };
    }
}

