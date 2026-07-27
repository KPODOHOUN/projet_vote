import {
  Injectable,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException
} from "@nestjs/common";
import { EventLayout, EventStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { VotesService } from "../votes/votes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import type { AuthUser } from "../auth/auth.types";
import {
  ACTIVATION_FEE_CFA_KEY,
  DEFAULT_ACTIVATION_FEE_CFA,
  parseIntSetting
} from "../common/platform-settings";
import { PartnersService } from "../partners/partners.service";
import { generateSecureEventSlug } from "../common/secure-event-slug";
import { generateUniqueCandidatePublicRef } from "../common/candidate-public-ref";
import { AccountPlanStatus } from "@prisma/client";
import { PlansService } from "../admin/plans/plans.service";

// Per-event branding / rules. Reused by create and update. All optional:
// a null field inherits from the owning organizer (ADR-016).
const brandColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur hex invalide (#RGB ou #RRGGBB).");

const photoUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "URL de photo invalide.");

const createEventSchema = z.object({
  slug: z.string().min(3).max(80),
  title: z.string().min(3).max(160),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  tagline: z.string().min(2).max(200).optional(),
  logoUrl: z.string().url().max(500).optional(),
  brandColor: brandColorSchema.optional(),
  layout: z.nativeEnum(EventLayout).optional(),
  voteUnitPriceCfa: z.number().int().positive().max(10_000_000).optional()
});

const createCandidateSchema = z.object({
  fullName: z.string().min(2).max(160),
  number: z.number().int().positive().optional(),
  photoUrl: photoUrlSchema.optional()
});

const quickStartEventSchema = z.object({
  title: z.string().min(3).max(160),
  candidateFullName: z.string().min(2).max(160),
  candidatePhotoUrl: photoUrlSchema.optional()
});

const updateCandidateSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  number: z.number().int().positive().optional(),
  photoUrl: photoUrlSchema.optional()
});

const setCandidateVoteCountSchema = z.object({
  voteCount: z.number().int().min(0).max(1_000_000),
  reason: z.string().min(3).max(500).optional()
});

const bulkImportCandidateItemSchema = z.object({
  fullName: z.string().min(2).max(160),
  number: z.number().int().positive().optional(),
  photoUrl: photoUrlSchema.optional()
});

const bulkImportCandidatesSchema = z.object({
  candidates: z.array(bulkImportCandidateItemSchema).min(1).max(200)
});

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly votesService: VotesService,
    private readonly notifications: NotificationsService,
    private readonly partnersService: PartnersService,
    private readonly plansService: PlansService
  ) { }

  /**
   * Central subscription gate: verifies the tenant has an active plan
   * AND that the plan's event limit hasn't been reached.
   * Platform admins are exempt. Partner accounts with active subs skip
   * the old activation-debt check.
   */
  private async assertSubscriptionForEventCreation(tenantId: string, userRole: UserRole): Promise<void> {
    // Platform admins and legacy test cases bypass the subscription check.
    if (userRole === UserRole.PLATFORM_ADMIN || userRole === UserRole.PLATFORM_SUPER_ADMIN) {
      return;
    }
    if (process.env.NODE_ENV === "test" && process.env.BYPASS_SUBSCRIPTION !== "0") {
      return;
    }

    // Vérifier via PlansService : abonnement actif + limite d'événements
    const { allowed, reason } = await this.plansService.canCreateEvent(tenantId);
    if (!allowed) {
      throw new ConflictException(reason ?? "Abonnement requis pour créer un évènement.");
    }
  }

  async listTenantEvents(user: AuthUser) {
    const events = await this.prisma.client.event.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { candidates: true }
        }
      }
    });

    return events.map(({ _count, ...event }) => ({
      ...event,
      candidateCount: _count.candidates
    }));
  }

  async createEvent(user: AuthUser, payload: unknown) {
    if (
      user.role !== UserRole.ORGANIZER_OWNER &&
      user.role !== UserRole.ORGANIZER_STAFF &&
      user.role !== UserRole.PLATFORM_ADMIN
    ) {
      throw new NotFoundException("Rôle non autorisé.");
    }

    // Subscription gate: must have an active plan to create events.
    await this.assertSubscriptionForEventCreation(user.tenantId, user.role);

    if (await this.partnersService.hasOutstandingDebt(user.tenantId)) {
      throw new ConflictException(
        "Création bloquée : une dette d'activation partenaire est en cours. Solde-la avant de créer un nouvel évènement."
      );
    }

    const input = createEventSchema.parse(payload);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException("endsAt doit être postérieur à startsAt.");
    }
    const createdEvent = await this.prisma.client.event
      .create({
        data: {
          tenantId: user.tenantId,
          slug: input.slug.toLowerCase(),
          title: input.title,
          startsAt,
          endsAt,
          status: EventStatus.DRAFT,
          ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.brandColor !== undefined ? { brandColor: input.brandColor } : {}),
          ...(input.layout !== undefined ? { layout: input.layout } : {}),
          ...(input.voteUnitPriceCfa !== undefined
            ? { voteUnitPriceCfa: input.voteUnitPriceCfa }
            : {})
        }
      })
      .catch((error: unknown) => {
        // Event slug is globally unique (the event is the public platform unit).
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException("Ce slug d'évènement est déjà utilisé.");
        }
        throw error;
      });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "event.created",
        targetType: "Event",
        targetId: createdEvent.id,
        metadata: { slug: createdEvent.slug, title: createdEvent.title }
      }
    });
    return createdEvent;
  }

  /**
   * Parcours express : concours + 1er candidat + activation auto si le forfait est à 0 FCFA.
   */
  async quickStartEvent(user: AuthUser, payload: unknown) {
    if (
      user.role !== UserRole.ORGANIZER_OWNER &&
      user.role !== UserRole.ORGANIZER_STAFF &&
      user.role !== UserRole.PLATFORM_ADMIN
    ) {
      throw new NotFoundException("Rôle non autorisé.");
    }

    // Subscription gate: must have an active plan to create events.
    await this.assertSubscriptionForEventCreation(user.tenantId, user.role);

    if (await this.partnersService.hasOutstandingDebt(user.tenantId)) {
      throw new ConflictException(
        "Création bloquée : une dette d'activation partenaire est en cours. Solde-la avant de créer un nouvel évènement."
      );
    }

    const input = quickStartEventSchema.parse(payload);
    const startsAt = new Date();
    startsAt.setSeconds(0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + 30);

    let slug = generateSecureEventSlug(input.title);
    let createdEvent = null as Awaited<ReturnType<typeof this.prisma.client.event.create>> | null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        createdEvent = await this.prisma.client.event.create({
          data: {
            tenantId: user.tenantId,
            slug,
            title: input.title,
            startsAt,
            endsAt,
            status: EventStatus.DRAFT
          }
        });
        break;
      } catch (error: unknown) {
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }
        slug = generateSecureEventSlug(`${input.title}-${attempt + 2}`);
      }
    }

    if (!createdEvent) {
      throw new ConflictException("Impossible de créer l'évènement. Essayez un autre nom.");
    }

    const candidate = await this.prisma.client.candidate.create({
      data: {
        eventId: createdEvent.id,
        fullName: input.candidateFullName,
        publicRef: await generateUniqueCandidatePublicRef(this.prisma.client),
        ...(input.candidatePhotoUrl !== undefined ? { photoUrl: input.candidatePhotoUrl } : {})
      }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "event.quick_started",
        targetType: "Event",
        targetId: createdEvent.id,
        metadata: { slug: createdEvent.slug, title: createdEvent.title, candidateId: candidate.id }
      }
    });

    let activated = false;
    try {
      await this.assertCanActivate(createdEvent);
      const activeEvent = await this.prisma.client.event.update({
        where: { id: createdEvent.id },
        data: { status: EventStatus.ACTIVE }
      });
      createdEvent = activeEvent;
      activated = true;
      void this.notifications.create(user.tenantId, "EVENT_ACTIVATED", {
        eventId: activeEvent.id,
        title: activeEvent.title
      });
    } catch {
      // Forfait requis — le concours reste en brouillon, l'organisateur paiera plus tard.
    }

    return {
      event: createdEvent,
      candidate,
      activated,
      slug: createdEvent.slug
    };
  }

  async listCandidates(user: AuthUser, eventId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: {
        id: eventId,
        tenantId: user.tenantId
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    return this.prisma.client.candidate.findMany({
      where: { eventId: event.id },
      orderBy: [{ number: "asc" }, { createdAt: "asc" }]
    });
  }

  async createCandidate(user: AuthUser, eventId: string, payload: unknown) {
    const event = await this.prisma.client.event.findFirst({
      where: {
        id: eventId,
        tenantId: user.tenantId
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    const input = createCandidateSchema.parse(payload);
    const createdCandidate = await this.prisma.client.candidate.create({
      data: {
        eventId: event.id,
        fullName: input.fullName,
        publicRef: await generateUniqueCandidatePublicRef(this.prisma.client),
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {})
      }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "candidate.created",
        targetType: "Candidate",
        targetId: createdCandidate.id,
        metadata: { eventId: event.id, number: createdCandidate.number }
      }
    });
    return createdCandidate;
  }

  async importCandidates(user: AuthUser, eventId: string, payload: unknown) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    const input = bulkImportCandidatesSchema.parse(payload);
    const numbers = new Set<number>();
    for (const item of input.candidates) {
      if (item.number == null) continue;
      if (numbers.has(item.number)) {
        throw new BadRequestException(`Numéro en double dans l'import : ${item.number}.`);
      }
      numbers.add(item.number);
    }

    const created: Array<{ id: string; fullName: string; number: number | null; publicRef: string }> = [];
    const errors: Array<{ number: number | null; fullName: string; message: string }> = [];

    for (const item of input.candidates) {
      try {
        const row = await this.prisma.client.candidate.create({
          data: {
            eventId: event.id,
            fullName: item.fullName,
            publicRef: await generateUniqueCandidatePublicRef(this.prisma.client),
            ...(item.number !== undefined ? { number: item.number } : {}),
            ...(item.photoUrl !== undefined ? { photoUrl: item.photoUrl } : {})
          }
        });
        created.push({
          id: row.id,
          fullName: row.fullName,
          number: row.number,
          publicRef: row.publicRef
        });
      } catch (error: unknown) {
        if (isUniqueConstraintViolation(error)) {
          errors.push({
            number: item.number ?? null,
            fullName: item.fullName,
            message: "Ce numéro est déjà pris pour cet évènement."
          });
        } else {
          throw error;
        }
      }
    }

    if (created.length > 0) {
      await this.prisma.client.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "candidates.imported",
          targetType: "Event",
          targetId: event.id,
          metadata: { createdCount: created.length, errorCount: errors.length }
        }
      });
    }

    return {
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors
    };
  }

  async updateCandidate(user: AuthUser, eventId: string, candidateId: string, payload: unknown) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const input = updateCandidateSchema.parse(payload);
    const existing = await this.prisma.client.candidate.findFirst({
      where: { id: candidateId, eventId: event.id }
    });
    if (!existing) {
      throw new NotFoundException("Candidat introuvable.");
    }
    return this.prisma.client.candidate.update({
      where: { id: candidateId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {})
      }
    });
  }

  async getEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      include: { _count: { select: { candidates: true } } }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const { _count, ...rest } = event;
    return { ...rest, candidateCount: _count.candidates };
  }

  async getEventDashboard(user: AuthUser, eventId: string) {
    const event = await this.getEvent(user, eventId);
    const [results, daily] = await Promise.all([
      this.votesService.computeResults(event.id),
      this.votesService.computeDailyStats(event.id)
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = daily.find((row) => row.date === today) ?? { date: today, votes: 0, amountCfa: 0 };
    return {
      event,
      candidateCount: event.candidateCount,
      totalVotes: results.totals.votes,
      totalAmountCfa: results.totals.amountCfa,
      todayVotes: todayStats.votes,
      todayAmountCfa: todayStats.amountCfa,
      daily,
      byCandidate: results.results
    };
  }

  async setCandidateVoteCount(
    user: AuthUser,
    eventId: string,
    candidateId: string,
    payload: unknown
  ) {
    if (user.role !== UserRole.ORGANIZER_OWNER && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new NotFoundException("Rôle non autorisé.");
    }
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const candidate = await this.prisma.client.candidate.findFirst({
      where: { id: candidateId, eventId: event.id }
    });
    if (!candidate) {
      throw new NotFoundException("Candidat introuvable.");
    }
    const input = setCandidateVoteCountSchema.parse(payload);
    const { results } = await this.votesService.computeResults(event.id);
    const current = results.find((row) => row.candidateId === candidateId)?.voteCount ?? 0;
    const delta = input.voteCount - current;
    if (delta === 0) {
      return { candidateId, voteCount: current };
    }

    const unitAmount = event.voteUnitPriceCfa ?? 0;

    if (delta > 0) {
      await this.prisma.client.vote.createMany({
        data: Array.from({ length: delta }, () => ({
          tenantId: user.tenantId,
          eventId: event.id,
          candidateId: candidate.id,
          amountCfa: unitAmount,
          paidAt: new Date()
        }))
      });
    } else {
      const toCancel = await this.prisma.client.vote.findMany({
        where: {
          eventId: event.id,
          candidateId: candidate.id,
          cancelledAt: null,
          paidAt: { not: null }
        },
        orderBy: { createdAt: "desc" },
        take: Math.abs(delta),
        select: { id: true }
      });
      if (toCancel.length < Math.abs(delta)) {
        throw new BadRequestException("Impossible d'ajuster : pas assez de votes payés.");
      }
      await this.prisma.client.vote.updateMany({
        where: { id: { in: toCancel.map((row) => row.id) } },
        data: {
          cancelledAt: new Date(),
          cancelledReason: input.reason ?? "Ajustement manuel organisateur",
          cancelledByUserId: user.userId
        }
      });
    }

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "candidate.vote_count_adjusted",
        targetType: "Candidate",
        targetId: candidate.id,
        metadata: {
          eventId: event.id,
          previousCount: current,
          targetCount: input.voteCount,
          delta,
          reason: input.reason ?? null
        }
      }
    });

    return { candidateId, voteCount: input.voteCount };
  }

  async deleteCandidate(user: AuthUser, eventId: string, candidateId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const candidate = await this.prisma.client.candidate.findFirst({
      where: { id: candidateId, eventId: event.id }
    });
    if (!candidate) {
      throw new NotFoundException("Candidat introuvable.");
    }
    const paidVotes = await this.prisma.client.vote.count({
      where: {
        candidateId: candidate.id,
        paidAt: { not: null },
        cancelledAt: null
      }
    });
    if (paidVotes > 0) {
      throw new ConflictException(
        "Impossible de supprimer un candidat qui a déjà reçu des votes payés."
      );
    }
    await this.prisma.client.candidate.delete({ where: { id: candidate.id } });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "candidate.deleted",
        targetType: "Candidate",
        targetId: candidate.id,
        metadata: { eventId: event.id, fullName: candidate.fullName }
      }
    });
    return { deleted: true };
  }

  async deleteEvent(user: AuthUser, eventId: string) {
    if (user.role !== UserRole.ORGANIZER_OWNER && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new NotFoundException("Rôle non autorisé.");
    }
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const paidVotes = await this.prisma.client.vote.count({
      where: {
        eventId: event.id,
        paidAt: { not: null },
        cancelledAt: null
      }
    });
    if (paidVotes > 0) {
      const archived = await this.prisma.client.event.update({
        where: { id: event.id },
        data: { status: EventStatus.ARCHIVED }
      });
      await this.prisma.client.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "event.archived",
          targetType: "Event",
          targetId: event.id,
          metadata: { reason: "paid_votes_exist" }
        }
      });
      return { deleted: false, archived: true, event: archived };
    }
    await this.prisma.client.event.delete({ where: { id: event.id } });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "event.deleted",
        targetType: "Event",
        targetId: event.id,
        metadata: { slug: event.slug, title: event.title }
      }
    });
    return { deleted: true, archived: false };
  }

  async getEventResults(user: AuthUser, eventId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    // Single source of truth for tallying: only PAID, non-cancelled votes are
    // counted (see VotesService.computeResults). Reused here so the organizer
    // view and the public view can never diverge.
    return { eventId: event.id, ...(await this.votesService.computeResults(event.id)) };
  }

  async updateEvent(user: AuthUser, eventId: string, payload: unknown) {
    const event = await this.prisma.client.event.findFirst({
      where: {
        id: eventId,
        tenantId: user.tenantId
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    const updateEventSchema = z.object({
      status: z.nativeEnum(EventStatus).optional(),
      title: z.string().min(3).max(160).optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      tagline: z.string().min(2).max(200).optional(),
      logoUrl: z.string().url().max(500).optional(),
      brandColor: brandColorSchema.optional(),
      layout: z.nativeEnum(EventLayout).optional(),
      voteUnitPriceCfa: z.number().int().positive().max(10_000_000).optional()
    });
    const input = updateEventSchema.parse(payload);

    const data: Record<string, unknown> = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.title !== undefined) data.title = input.title;
    const startsAtStr = input.startsAt;
    const endsAtStr = input.endsAt;
    if (typeof startsAtStr === "string") data.startsAt = new Date(startsAtStr);
    if (typeof endsAtStr === "string") data.endsAt = new Date(endsAtStr);
    if (input.tagline !== undefined) data.tagline = input.tagline;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
    if (input.brandColor !== undefined) data.brandColor = input.brandColor;
    if (input.layout !== undefined) data.layout = input.layout;
    if (input.voteUnitPriceCfa !== undefined) data.voteUnitPriceCfa = input.voteUnitPriceCfa;

    // Activation gate: going ACTIVE requires the activation fee to be paid
    // (no free quota) when a fee is configured.
    const isActivating = input.status === EventStatus.ACTIVE && event.status !== EventStatus.ACTIVE;
    if (isActivating) {
      await this.assertCanActivate(event);
    }

    const updatedEvent = await this.prisma.client.event.update({
      where: { id: event.id },
      data
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "event.updated",
        targetType: "Event",
        targetId: updatedEvent.id,
        metadata: input
      }
    });
    if (isActivating) {
      void this.notifications.create(user.tenantId, "EVENT_ACTIVATED", {
        eventId: updatedEvent.id,
        title: updatedEvent.title
      });
    }
    return updatedEvent;
  }

  /**
   * Activation requires the forfait to be paid (no free quota). No-op when no
   * fee is configured (monetization off). Throws 402 when the fee is unpaid.
   */
  private async assertCanActivate(event: { activationPaidAt: Date | null }): Promise<void> {
    const feeCfa = await this.readIntSetting(ACTIVATION_FEE_CFA_KEY, DEFAULT_ACTIVATION_FEE_CFA);
    if (feeCfa <= 0) {
      return; // activation monetization disabled → free
    }
    if (event.activationPaidAt) {
      return; // forfait already paid
    }
    throw new HttpException(
      `Forfait d'activation requis (${feeCfa} FCFA) pour activer cet évènement.`,
      HttpStatus.PAYMENT_REQUIRED
    );
  }

  private async readIntSetting(key: string, fallback: number): Promise<number> {
    const setting = await this.prisma.client.platformSetting.findUnique({ where: { key } });
    return parseIntSetting(setting?.value, fallback);
  }
}
