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
  TicketTypeStatus,
  UserRole
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isValidEventPreviewToken } from "../common/event-preview-token";
import { normalizePayinPhone } from "../common/mobile-operator";
import { formatTicketNumber } from "./ticket-numbers";
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

// Design de billet (éditeur visuel) : structure bornée, URLs d'image http(s)
// ou chemin local, valeurs CSS sans url()/expression (injectées dans un style).
const designImageUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "URL d'image invalide.");
const designCssValueSchema = z
  .string()
  .max(300)
  .regex(/^[#(),.%\-\w\s]*$/, "Valeur de style invalide.")
  .refine((value) => !/url|expression|javascript/i.test(value), "Valeur de style invalide.");
const designNumberSchema = z.number().finite().min(-10_000).max(10_000);
const designLayerSchema = z
  .object({
    id: z.string().min(1).max(64),
    // « qr » : emplacement du QR code d'entrée ; « shape » : rectangle, ellipse ou ligne.
    type: z.enum(["text", "image", "qr", "shape"]),
    content: z.string().max(2048),
    x: designNumberSchema,
    y: designNumberSchema,
    width: designNumberSchema,
    height: designNumberSchema,
    zIndex: z.number().int().min(0).max(1000),
    visible: z.boolean(),
    locked: z.boolean().optional(),
    rotation: designNumberSchema.optional(),
    style: z
      .object({
        fontSize: z.number().min(1).max(400).optional(),
        fontWeight: z.string().max(20).regex(/^[\w ]*$/).optional(),
        color: designCssValueSchema.optional(),
        textAlign: z.enum(["left", "center", "right"]).optional(),
        fontStyle: z.string().max(20).regex(/^[\w ]*$/).optional(),
        textDecoration: z.string().max(40).regex(/^[\w -]*$/).optional(),
        objectFit: z.enum(["contain", "cover", "fill"]).optional(),
        opacity: z.number().min(0).max(1).optional(),
        borderRadius: z.number().min(0).max(1000).optional(),
        // Polices disponibles à la fois dans l'éditeur et au rendu du billet.
        fontFamily: z.enum(["inter", "jakarta", "playfair", "unbounded", "mono"]).optional(),
        letterSpacing: z.number().min(-20).max(100).optional(),
        lineHeight: z.number().min(0.5).max(4).optional(),
        shape: z.enum(["rect", "ellipse", "line"]).optional(),
        fill: designCssValueSchema.optional(),
        stroke: designCssValueSchema.optional(),
        strokeWidth: z.number().min(0).max(200).optional()
      })
      .default({})
  })
  .superRefine((layer, ctx) => {
    if (layer.type === "image" && !designImageUrlSchema.safeParse(layer.content).success) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "URL d'image invalide." });
    }
    if ((layer.type === "qr" || layer.type === "shape") && layer.content !== "") {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Ce calque n'a pas de contenu." });
    }
    if (layer.type === "text" && layer.content.length > 500) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Texte trop long (500 caractères au plus)." });
    }
  });
const ticketDesignSchema = z.object({
  width: z.number().int().min(100).max(4000),
  height: z.number().int().min(100).max(4000),
  background: z.object({ type: z.enum(["color", "gradient"]), value: designCssValueSchema }),
  backgroundImage: designImageUrlSchema.nullable(),
  layers: z.array(designLayerSchema).max(50)
});

const purchaseTicketSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
  holderName: z.string().min(1).max(200).optional(),
  // Numéro Mobile Money qui paie : obligatoire, le paiement part sur ce numéro.
  holderPhone: z.string().min(8).max(20),
  holderEmail: z.string().email().optional(),
  operator: z.string().max(20).optional(),
  // Nom de chaque invité (billet i → guests[i]) ; vide = nom de l'acheteur.
  guests: z.array(z.string().trim().max(120)).max(100).optional()
});

const purchaseStatusSchema = z.object({
  transactionId: z.string().min(1),
  statusToken: z.string().min(1)
});

const validateTicketSchema = z.object({
  ticketId: z.string().min(1),
  secret: z.string().min(1),
  // Scanner d'un événement : un billet d'un autre événement est refusé.
  eventId: z.string().min(1).optional()
});

/**
 * Billets qui occupent le stock : vendus, ou réservés tant que leur paiement est
 * en attente. Tout échec, refus ou abandon de paiement annule la réservation
 * (vérification, réconciliation) : une réservation ne bloque donc le stock que
 * le temps que le prestataire tranche, et un paiement confirmé en retard ne peut
 * jamais dépasser la jauge.
 */
const STOCK_HOLDING_TICKETS: Prisma.TicketWhereInput = {
  status: { in: [TicketStatus.RESERVED, TicketStatus.PAID, TicketStatus.CONFIRMED, TicketStatus.USED] }
};

/** « le 12/12 à 20:14 » : heure du premier passage, pour l'agent à l'entrée. */
function usedAtLabel(usedAt: Date | null): string {
  if (!usedAt) return "";
  const label = usedAt.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Porto-Novo" });
  return ` (le ${label.replace(" ", " à ")})`;
}

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

    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true, status: true } });
    if (!event) throw new NotFoundException("Événement introuvable.");
    // Les billets en vente figurent au contrat signé : pas de nouveau type après publication.
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException("Ce concours est publié : ses billets sont fixés par le contrat signé, aucun nouveau type ne peut être ajouté.");
    }

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
      include: {
        _count: { select: { tickets: { where: { status: { in: ["PAID", "CONFIRMED", "USED"] } } } } },
        // Aperçu du billet dans l'éditeur : nom et date du concours.
        event: { select: { title: true, startsAt: true } }
      }
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
    const parsed = ticketDesignSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException("Design invalide : vérifiez les images et les couleurs utilisées.");
    }
    const design = parsed.data;
    const tt = await this.prisma.client.ticketType.findUnique({ where: { id: ticketTypeId }, select: { id: true } });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    return this.prisma.client.ticketType.update({
      where: { id: ticketTypeId },
      data: { design: design as Prisma.InputJsonValue }
    });
  }

  /** Vrai si un type de billet de ce nom figure au contrat signé du concours (ou si le concours n'a pas de contrat : concours antérieur). */
  private async isInSignedContract(eventId: string, ticketTypeName: string): Promise<boolean> {
    const contract = await this.prisma.client.eventContract.findFirst({
      where: { eventId, signedAt: { not: null } },
      orderBy: { signedAt: "desc" },
      select: { snapshot: true }
    });
    if (!contract) return true;
    const snapshot = contract.snapshot as { event?: { ticketTypes?: Array<{ name: string }> } };
    return (snapshot.event?.ticketTypes ?? []).some((t) => t.name === ticketTypeName);
  }

  async updateTicketType(eventId: string, ticketTypeId: string, payload: unknown) {
    const input = updateTicketTypeSchema.parse(payload);

    const tt = await this.prisma.client.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
      include: { event: { select: { status: true } } }
    });
    if (!tt) throw new NotFoundException("Type de ticket introuvable.");
    // Nom, prix et quantité des billets figurent dans le contrat signé : ils ne
    // changent plus après publication. Un type absent du contrat ne peut pas
    // être mis en vente.
    if (tt.event.status !== EventStatus.DRAFT) {
      const locked: string[] = [];
      if (input.priceCfa !== undefined && input.priceCfa !== tt.priceCfa) locked.push("le prix");
      if (input.name !== undefined && input.name !== tt.name) locked.push("le nom");
      if (input.quantity !== undefined && input.quantity !== tt.quantity) locked.push("la quantité");
      if (locked.length) {
        throw new ConflictException(
          `Ces éléments du billet sont fixés par le contrat signé et ne peuvent plus être modifiés : ${locked.join(", ")}.`
        );
      }
      if (input.status === TicketTypeStatus.ACTIVE && tt.status !== TicketTypeStatus.ACTIVE && !(await this.isInSignedContract(eventId, tt.name))) {
        throw new ConflictException("Ce billet ne figure pas au contrat signé : il ne peut pas être mis en vente.");
      }
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

  async listPublicTicketTypes(eventSlug: string, previewToken?: string) {
    const event = await this.prisma.client.event.findUnique({
      where: { slug: eventSlug.toLowerCase() },
      select: { id: true, status: true }
    });
    // Un brouillon n'est visible qu'avec le jeton d'aperçu de son organisateur.
    if (!event || (event.status === EventStatus.DRAFT && !isValidEventPreviewToken(event.id, previewToken))) {
      throw new NotFoundException("Événement introuvable.");
    }

    const now = new Date();
    const types = await this.prisma.client.ticketType.findMany({
      where: {
        eventId: event.id,
        status: TicketTypeStatus.ACTIVE
      },
      orderBy: { priceCfa: "asc" },
      include: {
        _count: {
          select: { tickets: { where: STOCK_HOLDING_TICKETS } }
        }
      }
    });

    return types.filter((tt) => {
      if (tt.saleStartsAt && tt.saleStartsAt > now) return false;
      if (tt.saleEndsAt && tt.saleEndsAt < now) return false;
      return true;
    });
  }

  /**
   * Libère les achats non payés de ce numéro sur ce type de billet quand ils
   * bloqueraient sa nouvelle tentative. Seuls ceux dont l'invite est partie
   * (référence prestataire connue) : un paiement tardif reste récupérable.
   */
  private async releaseOwnUnpaidIfBlocking(
    trx: Prisma.TransactionClient,
    args: { tenantId: string; ticketTypeId: string; buyerPhone: string; quantity: number; maxPerPerson: number; stock: number }
  ): Promise<void> {
    const [held, sold] = await Promise.all([
      trx.ticket.count({ where: { ticketTypeId: args.ticketTypeId, holderPhone: args.buyerPhone, ...STOCK_HOLDING_TICKETS } }),
      trx.ticket.count({ where: { ticketTypeId: args.ticketTypeId, ...STOCK_HOLDING_TICKETS } })
    ]);
    if (held + args.quantity <= args.maxPerPerson && sold + args.quantity <= args.stock) return;
    const own = await trx.ticket.findMany({
      where: { ticketTypeId: args.ticketTypeId, holderPhone: args.buyerPhone, status: TicketStatus.RESERVED, paymentTransactionId: { not: null } },
      select: { paymentTransactionId: true },
      distinct: ["paymentTransactionId"]
    });
    for (const { paymentTransactionId: txId } of own) {
      if (!txId) continue;
      const released = await trx.paymentTransaction.updateMany({
        where: { id: txId, status: PaymentStatus.PENDING, purpose: PaymentPurpose.TICKET, providerRef: { not: null } },
        data: { status: PaymentStatus.FAILED }
      });
      if (released.count === 0) continue;
      await trx.ticket.updateMany({ where: { paymentTransactionId: txId, status: TicketStatus.RESERVED }, data: { status: TicketStatus.CANCELLED } });
      await trx.auditLog.create({
        data: {
          tenantId: args.tenantId,
          actorUserId: "system:tickets:purchase",
          actorRole: UserRole.PLATFORM_ADMIN,
          action: "payment.abandoned_pending",
          targetType: "PaymentTransaction",
          targetId: txId,
          metadata: { reason: "replaced_by_new_purchase" }
        }
      });
    }
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
    // Numéro normalisé : la limite par personne compte tous les achats d'un même numéro,
    // quelle que soit la façon dont il a été saisi.
    const buyerPhone = normalizePayinPhone(input.holderPhone);

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
      // L'acheteur qui réessaie (invite USSD fermée, mauvais réseau) ne doit pas
      // être bloqué par son propre achat non payé : s'il dépasserait la limite
      // ou le stock, sa tentative précédente est remplacée. Si elle était quand
      // même payée, la confirmation tardive la récupère (PaymentVerifyService).
      await this.releaseOwnUnpaidIfBlocking(trx, {
        tenantId: event.tenantId,
        ticketTypeId: input.ticketTypeId,
        buyerPhone,
        quantity: input.quantity,
        maxPerPerson: ticketType.maxPerPerson,
        stock: ticketType.quantity
      });
      // Limite par personne, tous achats confondus (anti-revente) : billets payés
      // ou en cours de paiement sur ce numéro. Sous le verrou : pas de contournement en parallèle.
      const alreadyHeld = await trx.ticket.count({
        where: { ticketTypeId: input.ticketTypeId, holderPhone: buyerPhone, ...STOCK_HOLDING_TICKETS }
      });
      if (alreadyHeld + input.quantity > ticketType.maxPerPerson) {
        const left = Math.max(0, ticketType.maxPerPerson - alreadyHeld);
        throw new BadRequestException(
          left === 0
            ? `Maximum ${ticketType.maxPerPerson} ticket(s) par personne : ce numéro a déjà atteint la limite.`
            : `Maximum ${ticketType.maxPerPerson} ticket(s) par personne : ce numéro peut encore en prendre ${left}.`
        );
      }

      const sold = await trx.ticket.count({
        where: { ticketTypeId: input.ticketTypeId, ...STOCK_HOLDING_TICKETS }
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
              holderName: input.guests?.[i]?.trim() || input.holderName?.trim() || null,
              holderPhone: buyerPhone,
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
      // Le prestataire a refusé l'envoi : on libère tout de suite le stock. Si une
      // référence est déjà liée, le paiement peut encore aboutir : billets gardés,
      // la réconciliation tranche.
      await this.prisma.client.$transaction(async (trx) => {
        const failed = await trx.paymentTransaction.updateMany({
          where: { id: transaction.id, status: PaymentStatus.PENDING, providerRef: null },
          data: { status: PaymentStatus.FAILED }
        });
        if (failed.count === 0) return;
        await trx.ticket.updateMany({
          where: { paymentTransactionId: transaction.id, status: TicketStatus.RESERVED },
          data: { status: TicketStatus.CANCELLED }
        });
      });
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
    // Le lien d'un billet se partage (invité, WhatsApp) : jamais le téléphone ni
    // l'e-mail de l'acheteur dans la réponse publique.
    const { holderPhone: _phone, holderEmail: _email, ...shareable } = ticket;
    return shareable;
  }

  async getTicket(ticketId: string) {
    const ticket = await this.prisma.client.ticket.findUnique({
      where: { id: ticketId },
      include: {
        // Design de l'organisateur et date : le billet livré est rendu avec eux.
        ticketType: { select: { name: true, priceCfa: true, design: true } },
        event: { select: { title: true, slug: true, startsAt: true } }
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
        event: { select: { id: true, title: true, slug: true } }
      }
    });
    if (!ticket) throw new NotFoundException("Billet inconnu de votre organisation.");
    const expectedSecret = Buffer.from(ticket.qrSecret, "utf8");
    const givenSecret = Buffer.from(input.secret, "utf8");
    if (expectedSecret.length !== givenSecret.length || !timingSafeEqual(expectedSecret, givenSecret)) {
      throw new ForbiddenException("Code QR invalide pour ce billet (copie ou falsification).");
    }
    if (input.eventId && ticket.eventId !== input.eventId) {
      throw new BadRequestException(`Ce billet est pour un autre événement : ${ticket.event.title}.`);
    }
    if (ticket.status === "USED") {
      throw new BadRequestException(`Ce billet a déjà été utilisé${usedAtLabel(ticket.usedAt)}.`);
    }
    if (ticket.status === "CANCELLED" || ticket.status === "REFUNDED") {
      throw new BadRequestException("Ce billet n'est plus valide (annulé).");
    }
    if (ticket.status !== "PAID" && ticket.status !== "CONFIRMED") {
      throw new BadRequestException("Ce billet n'a pas encore été payé.");
    }

    // Passage à USED conditionnel : deux scans simultanés, une seule entrée.
    const usedAt = new Date();
    const used = await this.prisma.client.ticket.updateMany({
      where: { id: ticket.id, status: { in: [TicketStatus.PAID, TicketStatus.CONFIRMED] } },
      data: { status: TicketStatus.USED, usedAt }
    });
    if (used.count === 0) {
      const now = await this.prisma.client.ticket.findUnique({ where: { id: ticket.id }, select: { usedAt: true } });
      throw new BadRequestException(`Ce billet a déjà été utilisé${usedAtLabel(now?.usedAt ?? null)}.`);
    }

    return {
      valid: true,
      ticket: {
        id: ticket.id,
        number: formatTicketNumber(ticket.number),
        holderName: ticket.holderName,
        status: "USED",
        ticketType: ticket.ticketType.name,
        event: ticket.event.title,
        usedAt: usedAt.toISOString()
      }
    };
  }

  async listTickets(eventId: string, query: { status?: string | undefined; ticketTypeId?: string | undefined }) {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException("Événement introuvable.");
    const status = query.status ? z.nativeEnum(TicketStatus).safeParse(query.status) : null;
    if (status && !status.success) throw new BadRequestException("Statut de billet inconnu.");

    return this.prisma.client.ticket.findMany({
      where: {
        eventId,
        ...(status?.success ? { status: status.data } : {}),
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
