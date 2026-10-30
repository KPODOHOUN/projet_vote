import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  EventStatus,
  PaymentPurpose,
  PaymentStatus,
  TicketStatus,
  TicketTypeStatus
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { PaymentsService } from "../payments/payments.service";
import { PspRegistry } from "../payments/psp/psp.registry";

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
  // Numéro Mobile Money qui paie : obligatoire, le paiement part sur ce numéro.
  holderPhone: z.string().min(8).max(20),
  holderEmail: z.string().email().optional(),
  operator: z.string().max(20).optional()
});

const purchaseStatusSchema = z.object({
  transactionId: z.string().min(1),
  statusToken: z.string().min(1)
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
    private readonly mail: MailService,
    private readonly payments: PaymentsService,
    private readonly psp: PspRegistry
  ) {}

  async createTicketType(eventId: string, payload: unknown) {
    const input = createTicketTypeSchema.parse(payload);

    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Événement introuvable.");

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
        throw new ConflictException("Un type de ticket avec ce nom existe déjà pour cet événement.");
      }
      throw error;
    }
  }

  async listTicketTypes(eventId: string) {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Événement introuvable.");
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
      data: { design: design as Prisma.InputJsonValue }
    });
  }

  async updateTicketType(eventId: string, ticketTypeId: string, payload: unknown) {
    const input = updateTicketTypeSchema.parse(payload);

    const tt = await this.prisma.client.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
      include: { event: { select: { status: true } } }
    });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    // Le prix des billets existants figure dans le contrat signé : il ne change plus après publication.
    if (input.priceCfa !== undefined && tt.event.status !== EventStatus.DRAFT && input.priceCfa !== tt.priceCfa) {
      throw new ConflictException("Le prix de ce billet est fixé par le contrat signé : il ne peut plus être modifié.");
    }

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
    if (!event) throw new NotFoundException("Événement introuvable.");

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
      select: { id: true, tenantId: true, status: true, title: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException("Cet événement n'est pas ouvert à la vente.");
    }

    const provider = await this.psp.resolveProvider({ eventId: event.id, tenantId: event.tenantId });

    // Une seule transaction, verrou sur le type de billet : deux achats
    // simultanés passent l'un après l'autre, le stock ne peut pas être dépassé.
    const { tickets, transaction } = await this.prisma.client.$transaction(async (trx) => {
      await trx.$queryRaw`SELECT id FROM "TicketType" WHERE id = ${input.ticketTypeId} FOR UPDATE`;
      const ticketType = await trx.ticketType.findFirst({
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
      if (input.quantity > ticketType.maxPerPerson) {
        throw new BadRequestException(`Maximum ${ticketType.maxPerPerson} ticket(s) par achat.`);
      }

      const sold = await trx.ticket.count({
        where: {
          ticketTypeId: input.ticketTypeId,
          status: { in: [TicketStatus.PAID, TicketStatus.CONFIRMED, TicketStatus.USED, TicketStatus.RESERVED] }
        }
      });
      const remaining = ticketType.quantity - sold;
      if (remaining < input.quantity) {
        throw new BadRequestException(
          `Seulement ${Math.max(0, remaining)} ticket(s) disponible(s) sur ${input.quantity} demandé(s).`
        );
      }

      const amountCfa = input.quantity * ticketType.priceCfa;
      const transaction = await trx.paymentTransaction.create({
        data: {
          tenantId: event.tenantId,
          eventId: event.id,
          amountCfa,
          status: PaymentStatus.PENDING,
          purpose: PaymentPurpose.TICKET,
          provider,
          idempotencyKey: `ticket-purchase-${randomBytes(16).toString("hex")}`
        }
      });
      const tickets: Array<{ id: string; qrSecret: string; amountCfa: number }> = [];
      for (let i = 0; i < input.quantity; i++) {
        tickets.push(
          await trx.ticket.create({
            data: {
              ticketTypeId: input.ticketTypeId,
              eventId: event.id,
              holderName: input.holderName ?? null,
              holderPhone: input.holderPhone,
              holderEmail: input.holderEmail ?? null,
              qrSecret: generateQrSecret(),
              status: TicketStatus.RESERVED,
              amountCfa: ticketType.priceCfa,
              paymentTransactionId: transaction.id
            }
          })
        );
      }
      return { tickets, transaction };
    });

    let payment: { status: PaymentStatus | string; statusToken: string };
    try {
      payment = await this.payments.startTicketPayment({
        transactionId: transaction.id,
        eventId: event.id,
        tenantId: event.tenantId,
        amountCfa: transaction.amountCfa,
        payerPhone: input.holderPhone,
        operator: input.operator,
        description: `Billets — ${event.title}`
      });
    } catch (error) {
      // Le prestataire a refusé l'envoi : on libère tout de suite le stock.
      await this.prisma.client.$transaction([
        this.prisma.client.paymentTransaction.updateMany({
          where: { id: transaction.id, status: PaymentStatus.PENDING, providerRef: null },
          data: { status: PaymentStatus.FAILED }
        }),
        this.prisma.client.ticket.updateMany({
          where: { paymentTransactionId: transaction.id, status: TicketStatus.RESERVED },
          data: { status: TicketStatus.CANCELLED }
        })
      ]);
      throw error;
    }

    return {
      tickets: tickets.map((t) => ({ id: t.id, qrSecret: t.qrSecret, amountCfa: t.amountCfa })),
      transaction: {
        id: transaction.id,
        amountCfa: transaction.amountCfa,
        status: payment.status,
        statusToken: payment.statusToken
      }
    };
  }

  /** Suivi d'un achat : statut du paiement et des billets, lisible avec le jeton de l'achat. */
  async getPurchaseStatus(payload: unknown) {
    const input = purchaseStatusSchema.parse(payload);
    const payment = await this.payments.refreshTicketPayment(input.transactionId, input.statusToken);
    const tickets = await this.prisma.client.ticket.findMany({
      where: { paymentTransactionId: input.transactionId },
      select: { id: true, qrSecret: true, status: true }
    });
    return { transactionId: input.transactionId, status: payment.status, tickets };
  }

  /**
   * Lecture publique d'un billet : seulement avec son secret (celui du QR et du
   * lien reçu). Sans lui, l'identifiant seul ne révèle rien.
   */
  async getPublicTicket(ticketId: string, secret: string | undefined) {
    const ticket = await this.getTicket(ticketId);
    const expected = Buffer.from(ticket.qrSecret, "utf8");
    const given = Buffer.from(secret ?? "", "utf8");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new NotFoundException("Ticket introuvable.");
    }
    return ticket;
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

  /** L'événement doit appartenir à l'espace de l'organisateur connecté. */
  async assertEventAccess(user: AuthUser, eventId: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      select: { id: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
  }

  /** Le type de billet doit appartenir à CET événement, lui-même à l'organisateur connecté. */
  async assertTicketTypeAccess(user: AuthUser, eventId: string, ticketTypeId: string) {
    await this.assertEventAccess(user, eventId);
    const ticketType = await this.prisma.client.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
      select: { id: true }
    });
    if (!ticketType) throw new NotFoundException("Type de ticket introuvable.");
  }

  async validateTicket(user: AuthUser, payload: unknown) {
    const input = validateTicketSchema.parse(payload);

    const ticket = await this.prisma.client.ticket.findFirst({
      where: { id: input.ticketId, event: { tenantId: user.tenantId } },
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

    // Passage à USED conditionnel : deux scans simultanés, une seule entrée.
    const used = await this.prisma.client.ticket.updateMany({
      where: { id: ticket.id, status: { in: [TicketStatus.PAID, TicketStatus.CONFIRMED] } },
      data: { status: TicketStatus.USED, usedAt: new Date() }
    });
    if (used.count === 0) {
      throw new BadRequestException("Ce ticket a déjà été utilisé.");
    }

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
    if (!event) throw new NotFoundException("Événement introuvable.");

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
    if (!event) throw new NotFoundException("Événement introuvable.");

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
    if (!event) throw new NotFoundException("Événement introuvable.");

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
