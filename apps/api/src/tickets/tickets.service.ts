import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  EventStatus,
  PaymentPurpose,
  PaymentStatus,
  TicketStatus,
  TicketTypeStatus,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { ticketEmailHtml } from "./ticket-email.util";

const createTicketTypeSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  priceCfa: z.number().int().positive().max(5_000_000),
  quantity: z.number().int().positive().max(100_000),
  maxPerPerson: z.number().int().positive().max(100).default(10),
  saleStartsAt: z.coerce.date().optional(),
  saleEndsAt: z.coerce.date().optional()
});

const updateTicketTypeSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  priceCfa: z.number().int().positive().max(5_000_000).optional(),
  quantity: z.number().int().positive().max(100_000).optional(),
  maxPerPerson: z.number().int().positive().max(100).optional(),
  saleStartsAt: z.coerce.date().optional(),
  saleEndsAt: z.coerce.date().optional(),
  status: z.nativeEnum(TicketTypeStatus).optional()
});

const purchaseTicketSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
  holderName: z.string().min(1).max(200).optional(),
  holderPhone: z.string().min(8).max(20).optional(),
  holderEmail: z.string().email().optional()
});

const validateTicketSchema = z.object({
  ticketId: z.string().min(1),
  secret: z.string().min(1)
});

function generateQrSecret(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService
  ) {}

  async createTicketType(eventId: string, payload: unknown) {
    const input = createTicketTypeSchema.parse(payload);

    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    try {
      return await this.prisma.client.ticketType.create({
        data: {
          eventId,
          name: input.name,
          description: input.description ?? null,
          priceCfa: input.priceCfa,
          quantity: input.quantity,
          maxPerPerson: input.maxPerPerson,
          saleStartsAt: input.saleStartsAt ?? null,
          saleEndsAt: input.saleEndsAt ?? null
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
        throw new ConflictException("Un type de ticket avec ce nom existe déjà pour cet évènement.");
      }
      throw error;
    }
  }

  async listTicketTypes(eventId: string) {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    return this.prisma.client.ticketType.findMany({
      where: { eventId },
      orderBy: { priceCfa: "asc" },
      include: { _count: { select: { tickets: { where: { status: { in: ["PAID", "CONFIRMED", "USED"] } } } } } }
    });
  }

  async getTicketType(ticketTypeId: string) {
    const tt = await this.prisma.client.ticketType.findUnique({
      where: { id: ticketTypeId },
      include: { _count: { select: { tickets: { where: { status: { in: ["PAID", "CONFIRMED", "USED"] } } } } } }
    });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    return tt;
  }

  async getDesign(ticketTypeId: string) {
    const tt = await this.prisma.client.ticketType.findUnique({
      where: { id: ticketTypeId },
      select: { id: true, design: true }
    });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    return tt.design ?? { width: 600, height: 300, background: { type: "color", value: "#ffffff" }, backgroundImage: null, layers: [] };
  }

  async saveDesign(ticketTypeId: string, payload: unknown) {
    if (!payload || typeof payload !== "object") {
      throw new BadRequestException("Design invalide.");
    }
    const design = payload as Record<string, unknown>;
    const tt = await this.prisma.client.ticketType.findUnique({ where: { id: ticketTypeId }, select: { id: true } });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    return this.prisma.client.ticketType.update({
      where: { id: ticketTypeId },
      data: { design: design as any }
    });
  }

  async updateTicketType(eventId: string, ticketTypeId: string, payload: unknown) {
    const input = updateTicketTypeSchema.parse(payload);

    const tt = await this.prisma.client.ticketType.findFirst({
      where: { id: ticketTypeId, eventId }
    });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.priceCfa !== undefined) data.priceCfa = input.priceCfa;
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.maxPerPerson !== undefined) data.maxPerPerson = input.maxPerPerson;
    if (input.saleStartsAt !== undefined) data.saleStartsAt = input.saleStartsAt;
    if (input.saleEndsAt !== undefined) data.saleEndsAt = input.saleEndsAt;
    if (input.status !== undefined) data.status = input.status;

    try {
      return await this.prisma.client.ticketType.update({
        where: { id: ticketTypeId },
        data
      });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
        throw new ConflictException("Un type de ticket avec ce nom existe déjà.");
      }
      throw error;
    }
  }

  async deleteTicketType(eventId: string, ticketTypeId: string) {
    const tt = await this.prisma.client.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
      include: { _count: { select: { tickets: true } } }
    });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    if (tt._count.tickets > 0) {
      throw new BadRequestException("Impossible de supprimer un type de ticket qui a déjà des ventes.");
    }
    await this.prisma.client.ticketType.delete({ where: { id: ticketTypeId } });
    return { deleted: true };
  }

  async listPublicTicketTypes(eventSlug: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      select: { id: true, status: true }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    const now = new Date();
    const types = await this.prisma.client.ticketType.findMany({
      where: {
        eventId: event.id,
        status: TicketTypeStatus.ACTIVE
      },
      orderBy: { priceCfa: "asc" },
      include: {
        _count: {
          select: { tickets: { where: { status: { in: ["PAID", "CONFIRMED", "USED", "RESERVED"] } } } }
        }
      }
    });

    return types.filter((tt) => {
      if (tt.saleStartsAt && tt.saleStartsAt > now) return false;
      if (tt.saleEndsAt && tt.saleEndsAt < now) return false;
      return true;
    });
  }

  async purchaseTickets(eventSlug: string, payload: unknown) {
    const input = purchaseTicketSchema.parse(payload);

    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      select: { id: true, tenantId: true, status: true }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException("Cet évènement n'est pas ouvert à la vente.");
    }

    const ticketType = await this.prisma.client.ticketType.findFirst({
      where: { id: input.ticketTypeId, eventId: event.id, status: TicketTypeStatus.ACTIVE }
    });
    if (!ticketType) throw new NotFoundException("Type de ticket introuvable ou non disponible.");

    const now = new Date();
    if (ticketType.saleStartsAt && now < ticketType.saleStartsAt) {
      throw new BadRequestException("La vente de ce type de ticket n'a pas encore commencé.");
    }
    if (ticketType.saleEndsAt && now > ticketType.saleEndsAt) {
      throw new BadRequestException("La vente de ce type de ticket est terminée.");
    }

    const sold = await this.prisma.client.ticket.count({
      where: {
        ticketTypeId: input.ticketTypeId,
        status: { in: ["PAID", "CONFIRMED", "USED", "RESERVED"] }
      }
    });
    const remaining = ticketType.quantity - sold;
    if (remaining < input.quantity) {
      throw new BadRequestException(
        `Seulement ${remaining} ticket(s) disponible(s) sur ${input.quantity} demandé(s).`
      );
    }

    const amountCfa = input.quantity * ticketType.priceCfa;

    const tickets = await this.prisma.client.$transaction(async (trx) => {
      const created: Array<{ id: string; qrSecret: string; amountCfa: number; status: string; createdAt: Date; updatedAt: Date; eventId: string; ticketTypeId: string; holderName: string | null; holderPhone: string | null; holderEmail: string | null; usedAt: Date | null; paidAt: Date | null; confirmedAt: Date | null; }> = [];
      for (let i = 0; i < input.quantity; i++) {
        const ticket = await trx.ticket.create({
          data: {
            ticketTypeId: input.ticketTypeId,
            eventId: event.id,
            holderName: input.holderName ?? null,
            holderPhone: input.holderPhone ?? null,
            holderEmail: input.holderEmail ?? null,
            qrSecret: generateQrSecret(),
            status: "RESERVED" as TicketStatus,
            amountCfa: ticketType.priceCfa
          }
        });
        created.push(ticket);
      }
      return created;
    });

    const paymentTransaction = await this.prisma.client.paymentTransaction.create({
      data: {
        tenantId: event.tenantId,
        eventId: event.id,
        amountCfa,
        status: PaymentStatus.PENDING,
        purpose: PaymentPurpose.TICKET,
        provider: "FEEXPAY" as any,
        idempotencyKey: `ticket-purchase-${tickets[0]!.id}-${Date.now()}`
      }
    });

    if (env.API_PAYMENT_DEMO_MODE) {
      await this.prisma.client.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: { status: PaymentStatus.SUCCEEDED }
      });
      await this.confirmTickets(tickets.map((t) => t.id));
    }

    return {
      tickets: tickets.map((t) => ({ id: t.id, qrSecret: t.qrSecret, amountCfa: t.amountCfa })),
      transaction: {
        id: paymentTransaction.id,
        amountCfa,
        status: paymentTransaction.status
      }
    };
  }

  async confirmTickets(ticketIds: string[]) {
    await this.prisma.client.ticket.updateMany({
      where: { id: { in: ticketIds }, status: "RESERVED" as TicketStatus },
      data: { status: "PAID" as TicketStatus, paidAt: new Date(), confirmedAt: new Date() }
    });

    const tickets = await this.prisma.client.ticket.findMany({
      where: { id: { in: ticketIds } },
      include: {
        ticketType: { select: { name: true } },
        event: { select: { title: true, slug: true } }
      }
    });

    for (const ticket of tickets) {
      if (!ticket.holderEmail) continue;
      const info = {
        id: ticket.id,
        qrSecret: ticket.qrSecret,
        amountCfa: ticket.amountCfa,
        holderName: ticket.holderName,
        holderPhone: ticket.holderPhone,
        holderEmail: ticket.holderEmail,
        ticketType: ticket.ticketType,
        event: ticket.event
      };
      this.mail.send({
        to: [ticket.holderEmail],
        subject: `🎟 Votre billet pour ${ticket.event.title}`,
        html: ticketEmailHtml(info)
      });
    }
  }

  async getTicket(ticketId: string) {
    const ticket = await this.prisma.client.ticket.findUnique({
      where: { id: ticketId },
      include: {
        ticketType: { select: { name: true, priceCfa: true } },
        event: { select: { title: true, slug: true } }
      }
    });
    if (!ticket) throw new NotFoundException("Ticket introuvable.");
    return ticket;
  }

  async validateTicket(payload: unknown) {
    const input = validateTicketSchema.parse(payload);

    const ticket = await this.prisma.client.ticket.findUnique({
      where: { id: input.ticketId },
      include: {
        ticketType: { select: { name: true } },
        event: { select: { title: true, slug: true } }
      }
    });
    if (!ticket) throw new NotFoundException("Ticket introuvable.");
    if (ticket.qrSecret !== input.secret) {
      throw new ForbiddenException("Code QR invalide pour ce ticket.");
    }
    if (ticket.status === "USED") {
      throw new BadRequestException("Ce ticket a déjà été utilisé.");
    }
    if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
      throw new BadRequestException("Ce ticket n'est plus valide.");
    }
    if (ticket.status !== "PAID" && ticket.status !== "CONFIRMED") {
      throw new BadRequestException("Ce ticket n'a pas encore été payé.");
    }

    await this.prisma.client.ticket.update({
      where: { id: input.ticketId },
      data: { status: "USED" as TicketStatus, usedAt: new Date() }
    });

    return {
      valid: true,
      ticket: {
        id: ticket.id,
        holderName: ticket.holderName,
        status: "USED",
        ticketType: ticket.ticketType.name,
        event: ticket.event.title
      }
    };
  }

  async listTickets(eventId: string, query: { status?: string | undefined; ticketTypeId?: string | undefined }) {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    return this.prisma.client.ticket.findMany({
      where: {
        eventId,
        ...(query.status ? { status: query.status as TicketStatus } : {}),
        ...(query.ticketTypeId ? { ticketTypeId: query.ticketTypeId } : {})
      },
      include: { ticketType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async getTicketStats(eventId: string) {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    const [
      totalReserved,
      totalPaid,
      totalConfirmed,
      totalUsed,
      totalCancelled,
      totalRevenue,
      byType
    ] = await Promise.all([
      this.prisma.client.ticket.count({ where: { eventId, status: "RESERVED" as TicketStatus } }),
      this.prisma.client.ticket.count({ where: { eventId, status: "PAID" as TicketStatus } }),
      this.prisma.client.ticket.count({ where: { eventId, status: "CONFIRMED" as TicketStatus } }),
      this.prisma.client.ticket.count({ where: { eventId, status: "USED" as TicketStatus } }),
      this.prisma.client.ticket.count({ where: { eventId, status: "CANCELLED" as TicketStatus } }),
      this.prisma.client.ticket.aggregate({
        where: { eventId, status: { in: ["PAID", "CONFIRMED", "USED"] } },
        _sum: { amountCfa: true }
      }),
      this.prisma.client.ticketType.findMany({
        where: { eventId },
        include: {
          _count: {
            select: { tickets: { where: { status: { in: ["PAID", "CONFIRMED", "USED"] } } } }
          }
        }
      })
    ]);

    return {
      totalReserved,
      totalPaid,
      totalConfirmed,
      totalUsed,
      totalCancelled,
      totalSold: totalPaid + totalConfirmed + totalUsed,
      totalRevenueCfa: totalRevenue._sum.amountCfa ?? 0,
      byType: byType.map((tt) => ({
        id: tt.id,
        name: tt.name,
        sold: tt._count.tickets,
        quantity: tt.quantity,
        priceCfa: tt.priceCfa
      }))
    };
  }

  async exportTicketsCsv(eventId: string): Promise<string> {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true, title: true } });
    if (!event) throw new NotFoundException("Évènement introuvable.");

    const tickets = await this.prisma.client.ticket.findMany({
      where: { eventId },
      include: { ticketType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10_000
    });

    const header = "ID;Type;Titulaire;Téléphone;Email;Montant;Statut;Acheté le;Utilisé le";
    const rows = tickets.map((t) =>
      [
        t.id,
        t.ticketType.name,
        t.holderName ?? "",
        t.holderPhone ?? "",
        t.holderEmail ?? "",
        t.amountCfa.toString(),
        t.status,
        t.createdAt.toISOString().slice(0, 10),
        t.usedAt ? t.usedAt.toISOString().slice(0, 10) : ""
      ].join(";")
    );

    return [header, ...rows].join("\n");
  }

  async getDailySales(eventId: string) {
    const tickets = await this.prisma.client.ticket.findMany({
      where: { eventId, status: { in: ["PAID", "CONFIRMED", "USED"] } },
      select: { paidAt: true, amountCfa: true }
    });

    const daily = new Map<string, { count: number; revenue: number }>();
    for (const t of tickets) {
      if (!t.paidAt) continue;
      const day = t.paidAt.toISOString().slice(0, 10);
      const entry = daily.get(day) ?? { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += t.amountCfa;
      daily.set(day, entry);
    }

    const sorted = [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return sorted;
  }
}
