import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountPlanStatus, AccountPlanType, EventStatus } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { hashVoterPhone, voterPhoneLast4 } from "../common/voter-phone";

const castVoteSchema = z
  .object({
    tenantSlug: z.string().min(3).max(80),
    eventSlug: z.string().min(3).max(80),
    candidateNumber: z.number().int().positive().optional(),
    candidatePublicRef: z.string().min(8).max(32).optional(),
    quantity: z.number().int().positive().max(100_000),
    voterPhone: z.string().min(8).max(20)
  })
  .refine((v) => v.candidatePublicRef != null || v.candidateNumber != null, {
    message: "Indiquez candidatePublicRef ou candidateNumber."
  });

@Injectable()
export class VotesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicEvents(tenantSlug: string) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug: tenantSlug.toLowerCase() }
    });
    if (!tenant) {
      throw new NotFoundException("Tenant introuvable.");
    }

    return this.prisma.client.event.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true
      },
      orderBy: { startsAt: "desc" }
    });
  }

  async getPublicEvent(tenantSlug: string, eventSlug: string) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug: tenantSlug.toLowerCase() }
    });
    if (!tenant) {
      throw new NotFoundException("Tenant introuvable.");
    }

    const event = await this.prisma.client.event.findFirst({
      where: {
        tenantId: tenant.id,
        slug: eventSlug.toLowerCase()
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true,
        voteUnitPriceCfa: true
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    const candidates = await this.prisma.client.candidate.findMany({
      where: { eventId: event.id },
      select: {
        id: true,
        fullName: true,
        number: true
      },
      orderBy: { number: "asc" }
    });

    return {
      event,
      candidates
    } as const;
  }

  /**
   * Event-centric public resolution (ADR-016): the event is the public
   * "platform" unit, reached by its globally-unique slug. Branding is resolved
   * with event-overrides-organizer inheritance.
   */
  async getPublicEventBySlug(eventSlug: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      include: {
        tenant: {
          select: { displayName: true, slug: true, logoUrl: true, brandColor: true }
        }
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    const candidates = await this.prisma.client.candidate.findMany({
      where: { eventId: event.id },
      select: { id: true, fullName: true, number: true, publicRef: true, photoUrl: true },
      orderBy: [{ number: "asc" }, { createdAt: "asc" }]
    });
    const counts = await this.paidVoteCountByCandidate(event.id);

    return {
      organizer: { displayName: event.tenant.displayName, slug: event.tenant.slug },
      event: {
        slug: event.slug,
        title: event.title,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        voteUnitPriceCfa: event.voteUnitPriceCfa,
        layout: event.layout,
        // Branding: event value wins, otherwise inherit the organizer's default.
        branding: {
          logoUrl: event.logoUrl ?? event.tenant.logoUrl,
          brandColor: event.brandColor ?? event.tenant.brandColor,
          tagline: event.tagline
        }
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        number: c.number,
        publicRef: c.publicRef,
        photoUrl: c.photoUrl,
        voteCount: counts.get(c.id) ?? 0
      }))
    } as const;
  }

  /** candidateId → nombre de votes PAID (même règle d'intégrité que computeResults). */
  private async paidVoteCountByCandidate(eventId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.client.vote.groupBy({
      by: ["candidateId"],
      where: { eventId, cancelledAt: null, paidAt: { not: null } },
      _count: { _all: true }
    });
    return new Map(grouped.map((g) => [g.candidateId, g._count._all]));
  }

  /**
   * Profil candidat public : /e/{slug}/c/{publicRef}
   * Compatibilité : si ref est numérique, résolution par numéro (anciens liens).
   */
  async getPublicCandidate(eventSlug: string, ref: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      include: { tenant: { select: { displayName: true, slug: true, logoUrl: true, brandColor: true } } }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    const candidate = await this.resolveCandidateByPublicRef(event.id, ref);
    if (!candidate) throw new NotFoundException("Candidat introuvable.");

    const counts = await this.paidVoteCountByCandidate(event.id);
    return {
      organizer: { displayName: event.tenant.displayName, slug: event.tenant.slug },
      event: {
        slug: event.slug,
        title: event.title,
        status: event.status,
        endsAt: event.endsAt,
        voteUnitPriceCfa: event.voteUnitPriceCfa,
        branding: {
          logoUrl: event.logoUrl ?? event.tenant.logoUrl,
          brandColor: event.brandColor ?? event.tenant.brandColor,
          tagline: event.tagline
        }
      },
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        number: candidate.number,
        publicRef: candidate.publicRef,
        photoUrl: candidate.photoUrl,
        voteCount: counts.get(candidate.id) ?? 0
      }
    } as const;
  }

  private async resolveCandidateByPublicRef(
    eventId: string,
    ref: string
  ): Promise<{
    id: string;
    fullName: string;
    number: number | null;
    publicRef: string;
    photoUrl: string | null;
  } | null> {
    const trimmed = ref.trim();
    if (!trimmed) return null;

    const byRef = await this.prisma.client.candidate.findFirst({
      where: { eventId, publicRef: trimmed },
      select: { id: true, fullName: true, number: true, publicRef: true, photoUrl: true }
    });
    if (byRef) return byRef;

    if (/^\d+$/.test(trimmed)) {
      return this.prisma.client.candidate.findFirst({
        where: { eventId, number: Number.parseInt(trimmed, 10) },
        select: { id: true, fullName: true, number: true, publicRef: true, photoUrl: true }
      });
    }

    return null;
  }

  /** Public results by global event slug. Cancelled votes are excluded. */
  async getPublicEventResults(eventSlug: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        logoUrl: true,
        brandColor: true,
        tagline: true,
        tenant: { select: { logoUrl: true, brandColor: true } }
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const { id, slug, title, status } = event;
    // Public ranking: expose vote COUNTS and ordering only — never the money
    // collected. Revealing per-candidate/total XOF publicly discourages voters
    // (fear of "being fleeced" / being first) and fuels disputes. The organizer
    // and platform-admin views keep the amounts via computeResults() directly.
    const { results, totals } = await this.computeResults(id);
    return {
      event: {
        id,
        slug,
        title,
        status,
        // Branding: event value wins, otherwise inherit the organizer's default.
        branding: {
          logoUrl: event.logoUrl ?? event.tenant.logoUrl,
          brandColor: event.brandColor ?? event.tenant.brandColor,
          tagline: event.tagline
        }
      },
      results: results.map(({ totalAmountCfa: _omitted, ...rest }) => rest),
      totals: { votes: totals.votes }
    };
  }

  /**
   * Tally votes per candidate for an event. The integrity gate of a paid-voting
   * platform: a vote counts ONLY once its VOTE payment is confirmed (`paidAt`
   * set by the webhook) AND it is not cancelled (god-mode soft-void). Without
   * this, anyone could inflate tallies for free via `castVote` (which creates
   * the vote row before any payment). The `paidAt`/`cancelledAt` filter is a
   * single indexed scan — no per-event join against PaymentTransaction — so it
   * stays cheap even for a high-volume event. Candidates with zero votes are
   * still listed.
   */
  async computeResults(eventId: string) {
    const candidates = await this.prisma.client.candidate.findMany({
      where: { eventId },
      select: { id: true, fullName: true, number: true, photoUrl: true },
      orderBy: { number: "asc" }
    });
    const grouped = await this.prisma.client.vote.groupBy({
      by: ["candidateId"],
      where: { eventId, cancelledAt: null, paidAt: { not: null } },
      _sum: { amountCfa: true, votesCount: true }
    });
    const byCandidate = new Map(grouped.map((g) => [g.candidateId, g]));
    const results = candidates.map((c) => ({
      candidateId: c.id,
      fullName: c.fullName,
      number: c.number,
      photoUrl: c.photoUrl,
      voteCount: byCandidate.get(c.id)?._sum.votesCount ?? 0,
      totalAmountCfa: byCandidate.get(c.id)?._sum.amountCfa ?? 0
    }));
    return {
      results,
      totals: {
        votes: results.reduce((acc, r) => acc + r.voteCount, 0),
        amountCfa: results.reduce((acc, r) => acc + r.totalAmountCfa, 0)
      }
    } as const;
  }

  /** Votes payés groupés par jour (date UTC ISO YYYY-MM-DD). */
  async computeDailyStats(eventId: string) {
    const votes = await this.prisma.client.vote.findMany({
      where: { eventId, cancelledAt: null, paidAt: { not: null } },
      select: { paidAt: true, amountCfa: true, votesCount: true },
      orderBy: { paidAt: "asc" }
    });
    const byDay = new Map<string, { votes: number; amountCfa: number }>();
    for (const vote of votes) {
      if (!vote.paidAt) continue;
      const date = vote.paidAt.toISOString().slice(0, 10);
      const current = byDay.get(date) ?? { votes: 0, amountCfa: 0 };
      current.votes += vote.votesCount;
      current.amountCfa += vote.amountCfa;
      byDay.set(date, current);
    }
    return Array.from(byDay.entries()).map(([date, stats]) => ({ date, ...stats }));
  }

  async castVote(payload: unknown) {
    const input = castVoteSchema.parse(payload);

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug: input.tenantSlug.toLowerCase() }
    });
    if (!tenant) {
      throw new NotFoundException("Tenant introuvable.");
    }

    const event = await this.prisma.client.event.findFirst({
      where: {
        tenantId: tenant.id,
        slug: input.eventSlug.toLowerCase()
      }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }

    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException("Cet évènement n'est pas ouvert au vote.");
    }
    const now = new Date();
    if (now < event.startsAt || now > event.endsAt) {
      throw new BadRequestException("Le vote est fermé pour cet évènement (hors période).");
    }

    if (!(process.env.NODE_ENV === "test" && process.env.BYPASS_SUBSCRIPTION !== "0")) {
      // Subscription gate: organizer must have an active plan to receive votes.
      // Exception 1: votes "in flight" are checked at castVote, not at payment
      //   confirmation — a vote already created is always honored.
      // Exception 2: Partner-expired events remain open until event.endsAt.
      const activeSub = await this.prisma.client.accountSubscription.findFirst({
        where: {
          tenantId: tenant.id,
          status: AccountPlanStatus.ACTIVE,
          expiresAt: { gt: now }
        },
        select: { id: true }
      });
      if (!activeSub) {
        // Check for the Partner grace-period exception: if the tenant had a
        // Partner subscription that has expired but this event is still running.
        const expiredPartnerSub = await this.prisma.client.accountSubscription.findFirst({
          where: {
            tenantId: tenant.id,
            planType: AccountPlanType.PARTNER,
            status: AccountPlanStatus.EXPIRED
          },
          orderBy: { expiresAt: "desc" },
          select: { id: true, startsAt: true, expiresAt: true }
        });
        // Event must have been created during the partner period AND still be running.
        const partnerGrace = expiredPartnerSub
          && event.createdAt >= expiredPartnerSub.startsAt
          && event.createdAt <= expiredPartnerSub.expiresAt
          && event.endsAt > now
          && event.status === EventStatus.ACTIVE;
        if (!partnerGrace) {
          throw new ForbiddenException(
            "L'abonnement de l'organisateur a expiré. Les votes sont temporairement suspendus."
          );
        }
      }
    }

    // Per-event voting rule: when a unit price is set, amount must be a multiple of it.
    if (event.voteUnitPriceCfa === null || event.voteUnitPriceCfa <= 0) {
      throw new BadRequestException(
        "Cet évènement n'a pas de prix unitaire défini. Impossible de voter."
      );
    }
    const amountCfa = input.quantity * event.voteUnitPriceCfa;
    if (amountCfa > 5_000_000) {
      throw new BadRequestException("Le montant total dépasse la limite autorisée.");
    }

    let candidate;
    if (input.candidatePublicRef) {
      candidate = await this.resolveCandidateByPublicRef(event.id, input.candidatePublicRef);
    } else {
      const candidateNumber = input.candidateNumber;
      if (candidateNumber == null) {
        throw new BadRequestException("Indiquez candidatePublicRef ou candidateNumber.");
      }
      candidate = await this.prisma.client.candidate.findFirst({
        where: {
          eventId: event.id,
          number: candidateNumber
        },
        select: {
          id: true,
          fullName: true,
          number: true,
          publicRef: true,
          photoUrl: true
        }
      });
    }
    if (!candidate) {
      throw new NotFoundException("Candidat introuvable.");
    }

    const votesCount = input.quantity;

    return this.prisma.client.vote.create({
      data: {
        tenantId: tenant.id,
        eventId: event.id,
        candidateId: candidate.id,
        amountCfa,
        votesCount,
        // Raw phone is never stored — only a salted hash + last 4 digits.
        voterPhoneHash: hashVoterPhone(input.voterPhone),
        voterPhoneLast4: voterPhoneLast4(input.voterPhone)
      }
    });
  }
}
