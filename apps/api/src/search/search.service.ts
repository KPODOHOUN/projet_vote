import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const searchQuerySchema = z.object({
  q: z.string().optional().default(""),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5)
});

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: AuthUser, rawQuery: unknown) {
    const parsed = searchQuerySchema.parse(rawQuery);
    const q = parsed.q.trim();
    const limit = parsed.limit;
    const empty = { query: q, events: [], candidates: [], members: [], payments: [] };
    if (q.length < 2) return empty;

    const canSeeSensitive = user.role !== "ORGANIZER_STAFF";
    const insensitive = { contains: q, mode: "insensitive" as const };

    const events = await this.prisma.client.event.findMany({
      where: { tenantId: user.tenantId, OR: [{ title: insensitive }, { slug: insensitive }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, slug: true, status: true }
    });

    const candidateRows = await this.prisma.client.candidate.findMany({
      where: { fullName: insensitive, event: { tenantId: user.tenantId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, fullName: true, number: true, event: { select: { id: true, title: true } } }
    });

    const members = canSeeSensitive
      ? await this.prisma.client.user.findMany({
          where: { tenantId: user.tenantId, email: insensitive },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, email: true, role: true }
        })
      : [];

    const paymentRows = canSeeSensitive
      ? await this.prisma.client.paymentTransaction.findMany({
          where: { tenantId: user.tenantId, providerRef: insensitive },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, providerRef: true, status: true, amountCfa: true, createdAt: true, eventId: true }
        })
      : [];

    return {
      query: q,
      events,
      candidates: candidateRows.map((c) => ({ id: c.id, fullName: c.fullName, number: c.number, eventId: c.event.id, eventTitle: c.event.title })),
      members,
      payments: paymentRows.map((p) => ({ id: p.id, providerRef: p.providerRef, status: p.status, amountCfa: p.amountCfa, createdAt: p.createdAt.toISOString(), eventId: p.eventId }))
    };
  }
}
