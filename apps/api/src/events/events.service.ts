import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException
} from "@nestjs/common";
import { EventFontStyle, EventHeroBackground, EventLayout, EventPageStyle, EventStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { VotesService } from "../votes/votes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { isUniqueConstraintViolation } from "../common/prisma-errors";
import type { AuthUser } from "../auth/auth.types";
import { generateSecureEventSlug } from "../common/secure-event-slug";
import { generateUniqueCandidatePublicRef } from "../common/candidate-public-ref";
import { assertEventTransition } from "./event-lifecycle";

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
  // null = effacer (M3) ; absent = ne pas toucher.
  tagline: z.string().min(2).max(200).nullable().optional(),
  logoUrl: photoUrlSchema.nullable().optional(),
  brandColor: brandColorSchema.nullable().optional(),
  layout: z.nativeEnum(EventLayout).optional(),
  coverUrl: photoUrlSchema.nullable().optional(),
  pageStyle: z.nativeEnum(EventPageStyle).optional(),
  fontStyle: z.nativeEnum(EventFontStyle).optional(),
  heroBackground: z.nativeEnum(EventHeroBackground).optional(),
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
    private readonly notifications: NotificationsService
  ) { }

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
          ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
          ...(input.pageStyle !== undefined ? { pageStyle: input.pageStyle } : {}),
          ...(input.fontStyle !== undefined ? { fontStyle: input.fontStyle } : {}),
          ...(input.heroBackground !== undefined ? { heroBackground: input.heroBackground } : {}),
          ...(input.voteUnitPriceCfa !== undefined
            ? { voteUnitPriceCfa: input.voteUnitPriceCfa }
            : {})
        }
      })
      .catch((error: unknown) => {
        // Event slug is globally unique (the event is the public platform unit).
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException("Ce slug d'événement est déjà utilisé.");
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
   * Parcours express : concours en brouillon + 1er candidat. La mise en ligne
   * passe ensuite par la signature du contrat.
   */
  async quickStartEvent(user: AuthUser, payload: unknown) {
    if (
      user.role !== UserRole.ORGANIZER_OWNER &&
      user.role !== UserRole.ORGANIZER_STAFF &&
      user.role !== UserRole.PLATFORM_ADMIN
    ) {
      throw new NotFoundException("Rôle non autorisé.");
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
      throw new ConflictException("Impossible de créer l'événement. Essayez un autre nom.");
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

    return {
      event: createdEvent,
      candidate,
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
            message: "Ce numéro est déjà pris pour cet événement."
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
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
      throw new NotFoundException("Événement introuvable.");
    }

    const updateEventSchema = z.object({
      status: z.nativeEnum(EventStatus).optional(),
      title: z.string().min(3).max(160).optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      // null = effacer (M3) ; absent = ne pas toucher.
      tagline: z.string().min(2).max(200).nullable().optional(),
      logoUrl: photoUrlSchema.nullable().optional(),
      brandColor: brandColorSchema.nullable().optional(),
      layout: z.nativeEnum(EventLayout).optional(),
      coverUrl: photoUrlSchema.nullable().optional(),
      pageStyle: z.nativeEnum(EventPageStyle).optional(),
      fontStyle: z.nativeEnum(EventFontStyle).optional(),
      heroBackground: z.nativeEnum(EventHeroBackground).optional(),
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
    if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl;
    if (input.pageStyle !== undefined) data.pageStyle = input.pageStyle;
    if (input.fontStyle !== undefined) data.fontStyle = input.fontStyle;
    if (input.heroBackground !== undefined) data.heroBackground = input.heroBackground;
    if (input.voteUnitPriceCfa !== undefined) data.voteUnitPriceCfa = input.voteUnitPriceCfa;

    if (input.status !== undefined) {
      assertEventTransition(event.status, input.status, "update");
    }
    if (event.status === EventStatus.CLOSED || event.status === EventStatus.ARCHIVED) {
      const onlyArchiving = Object.keys(input).every((key) => key === "status");
      if (!onlyArchiving) {
        throw new ConflictException("Un concours clôturé ou archivé ne se modifie plus.");
      }
    }
    // Le prix du vote figure dans le contrat signé : il ne change plus après publication.
    if (
      input.voteUnitPriceCfa !== undefined &&
      event.status !== EventStatus.DRAFT &&
      input.voteUnitPriceCfa !== event.voteUnitPriceCfa
    ) {
      throw new ConflictException("Le prix du vote est fixé par le contrat signé : il ne peut plus être modifié.");
    }
    const nextStartsAt = (data.startsAt as Date | undefined) ?? event.startsAt;
    const nextEndsAt = (data.endsAt as Date | undefined) ?? event.endsAt;
    if (nextEndsAt.getTime() <= nextStartsAt.getTime()) {
      throw new BadRequestException("La date de fin doit être après la date de début.");
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
    return updatedEvent;
  }

}
