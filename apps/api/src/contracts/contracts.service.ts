import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ContractStatus, EventStatus, NotificationType, Prisma, TicketTypeStatus, UserRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { normalizePayinPhone } from "../common/mobile-operator";
import { env } from "../config/env";
import { assertEventTransition, missingPublicationRequirements } from "../events/event-lifecycle";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { renderContractPdf } from "./contract-pdf";
import {
  CONTRACT_TEMPLATE_VERSION,
  buildContractDocument,
  contractText,
  missingPlatformLegalFields,
  sha256Hex,
  type ContractIdentity,
  type ContractSnapshot
} from "./contract-template";

const identitySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(8).max(30),
  address: z.string().trim().min(5).max(300),
  idDocumentType: z.string().trim().min(2).max(60),
  idDocumentNumber: z.string().trim().min(3).max(60),
  organizationName: z.string().trim().min(2).max(160),
  organizationLegalId: z.string().trim().min(3).max(80).nullable().optional()
});

const signSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signerName: z.string().trim().min(3).max(160),
  accept: z.literal(true),
  code: z.string().regex(/^\d{6}$/),
  // Signature tracée à l'écran (facultative), en PNG (data URL), 300 Ko au plus.
  signatureImage: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .max(400_000)
    .optional()
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type EventForContract = Prisma.EventGetPayload<{
  include: { ticketTypes: true; _count: { select: { candidates: true } } };
}>;

/**
 * Contrat organisateur ↔ SHADOMA d'un concours : génération à partir d'un
 * instantané figé, signature électronique simple (acceptation explicite, nom,
 * signature tracée, code email) et publication du concours dans la même
 * transaction. Seul ce service fait passer un concours de DRAFT à ACTIVE.
 */
@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offerSettings: OfferSettingsService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    // Facultatif : sans service d'email (tests), la copie n'est simplement pas envoyée.
    @Optional() private readonly mail?: MailService
  ) {}

  /** État du contrat d'un concours pour l'organisateur : prérequis, contrat en cours, historique. */
  async getOverview(user: AuthUser, eventId: string) {
    const event = await this.loadEvent(user, eventId);
    const contracts = await this.prisma.client.eventContract.findMany({
      where: { eventId: event.id },
      orderBy: { generatedAt: "desc" },
      select: CONTRACT_SUMMARY
    });
    const current = contracts.find((c) => c.status !== ContractStatus.SUPERSEDED) ?? null;
    return {
      eventStatus: event.status,
      requirements: missingPublicationRequirements({ ...event, candidateCount: event._count.candidates }),
      platformLegalMissing: missingPlatformLegalFields(this.platformIdentity()),
      current: current ? await this.withContent(current.id) : null,
      history: contracts.filter((c) => c.id !== current?.id),
      prefill: await this.prefillIdentity(user)
    };
  }

  /** Génère (ou régénère) le contrat à signer, à partir des données actuelles du concours. */
  async generate(user: AuthUser, eventId: string, payload: unknown) {
    this.assertCanEngage(user);
    const identity = identitySchema.parse(payload);
    const event = await this.loadEvent(user, eventId);
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException("Ce concours est déjà publié : son contrat est signé.");
    }
    const missing = missingPublicationRequirements({ ...event, candidateCount: event._count.candidates });
    if (missing.length) {
      throw new ConflictException(`Avant de générer le contrat, ajoutez : ${missing.join(", ")}.`);
    }

    const contractId = `ctr_${randomBytes(12).toString("hex")}`;
    const generatedAt = new Date();
    const snapshot = await this.buildSnapshot(event, user, {
      ...identity,
      phone: normalizePayinPhone(identity.phone),
      email: user.email,
      organizationLegalId: identity.organizationLegalId ?? null
    }, generatedAt);
    const text = contractText(buildContractDocument(snapshot, contractId));

    await this.prisma.client.$transaction([
      this.prisma.client.eventContract.updateMany({
        where: { eventId: event.id, status: ContractStatus.PENDING_SIGNATURE },
        data: { status: ContractStatus.SUPERSEDED, supersededAt: generatedAt }
      }),
      this.prisma.client.eventContract.create({
        data: {
          id: contractId,
          eventId: event.id,
          tenantId: event.tenantId,
          templateVersion: CONTRACT_TEMPLATE_VERSION,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          contentText: text,
          contentHash: sha256Hex(text),
          generatedAt
        }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: event.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "contract.generated",
          targetType: "EventContract",
          targetId: contractId,
          metadata: { eventId: event.id, templateVersion: CONTRACT_TEMPLATE_VERSION }
        }
      })
    ]);
    return this.withContent(contractId);
  }

  /** Envoie le code de signature à l'email du compte. */
  async sendSignatureCode(user: AuthUser, eventId: string, contractId: string) {
    this.assertCanEngage(user);
    const { event, contract } = await this.loadContract(user, eventId, contractId);
    if (contract.status !== ContractStatus.PENDING_SIGNATURE) {
      throw new ConflictException("Ce contrat n'est plus à signer.");
    }
    return this.auth.sendContractSignatureCode(user.userId, user.email, event.title);
  }

  /** Signature : vérifications côté serveur, puis contrat signé et concours publié dans une même transaction. */
  async sign(
    user: AuthUser,
    eventId: string,
    contractId: string,
    payload: unknown,
    meta: { ip: string | null; userAgent: string | null }
  ) {
    this.assertCanEngage(user);
    const input = signSchema.parse(payload);
    const { event, contract } = await this.loadContract(user, eventId, contractId);
    if (contract.status === ContractStatus.SIGNED) {
      throw new ConflictException("Ce contrat est déjà signé.");
    }
    if (contract.status !== ContractStatus.PENDING_SIGNATURE) {
      throw new ConflictException("Ce contrat a été remplacé par une version plus récente : relisez-la.");
    }
    if (input.contentHash !== contract.contentHash) {
      throw new ConflictException("Le contrat affiché ne correspond pas à celui à signer : rechargez la page et relisez-le.");
    }
    const snapshot = contract.snapshot as unknown as ContractSnapshot;
    const expectedName = `${snapshot.organizer.firstName} ${snapshot.organizer.lastName}`;
    if (normalizeName(input.signerName) !== normalizeName(expectedName)) {
      throw new ConflictException(`Saisissez votre nom tel qu'il figure au contrat : ${expectedName}.`);
    }
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException("Ce concours n'est plus en brouillon.");
    }
    const missing = missingPublicationRequirements({ ...event, candidateCount: event._count.candidates });
    if (missing.length) {
      throw new ConflictException(`Le concours n'est plus prêt : ajoutez ${missing.join(", ")}.`);
    }
    const legalMissing = missingPlatformLegalFields(this.platformIdentity());
    if (legalMissing.length && env.NODE_ENV === "production") {
      throw new ConflictException("La signature est indisponible : les informations légales de SHADOMA ne sont pas encore configurées.");
    }

    // Le texte présenté doit toujours correspondre aux données actuelles : un
    // prix, une date, un taux ou un modèle changé depuis exige un nouveau contrat.
    const fresh = await this.buildSnapshot(event, user, snapshot.organizer, new Date(snapshot.generatedAt));
    const freshText = contractText(buildContractDocument(fresh, contract.id));
    if (sha256Hex(freshText) !== contract.contentHash) {
      await this.prisma.client.eventContract.updateMany({
        where: { id: contract.id, status: ContractStatus.PENDING_SIGNATURE },
        data: { status: ContractStatus.SUPERSEDED, supersededAt: new Date() }
      });
      throw new ConflictException("Le concours ou les conditions ont changé depuis la génération du contrat : générez-en un nouveau et relisez-le.");
    }

    const signatureImage = input.signatureImage ? Buffer.from(input.signatureImage.split(",")[1] ?? "", "base64") : null;
    if (signatureImage && (signatureImage.length < 200 || !signatureImage.subarray(0, 8).equals(PNG_MAGIC))) {
      throw new ConflictException("La signature tracée est vide ou illisible : effacez-la ou signez à nouveau.");
    }

    // Code vérifié ici, consommé dans la transaction de signature : si celle-ci
    // échoue, le code reste utilisable.
    const otpChallengeId = await this.auth.checkContractSignatureCode(user.userId, input.code);
    const otpVerifiedAt = new Date();
    const signedAt = new Date();
    const pdf = await renderContractPdf(buildContractDocument(snapshot, contract.id), {
      generatedAt: contract.generatedAt,
      proof: {
        signerName: expectedName,
        signerEmail: user.email,
        signedAt,
        otpVerifiedAt,
        signerIp: meta.ip,
        contentHash: contract.contentHash,
        contractId: contract.id,
        signatureImage
      }
    });
    const pdfBuffer = Buffer.from(pdf);

    assertEventTransition(EventStatus.DRAFT, EventStatus.ACTIVE, "contract");
    await this.prisma.client.$transaction(async (tx) => {
      await this.auth.consumeOtpChallengeOnce(otpChallengeId, tx);
      const signed = await tx.eventContract.updateMany({
        where: { id: contract.id, status: ContractStatus.PENDING_SIGNATURE, contentHash: input.contentHash },
        data: {
          status: ContractStatus.SIGNED,
          signedAt,
          signedByUserId: user.userId,
          signerName: expectedName,
          signerEmail: user.email,
          signatureImage: input.signatureImage ?? null,
          otpVerifiedAt,
          signerIp: meta.ip,
          signerUserAgent: meta.userAgent?.slice(0, 300) ?? null,
          signedPdf: pdfBuffer,
          signedPdfSha256: sha256Hex(pdfBuffer)
        }
      });
      if (signed.count === 0) {
        throw new ConflictException("Ce contrat vient d'être signé ou remplacé.");
      }
      // Publication : taux et réserve figés par le contrat signé. Un contrat
      // antérieur sans taux billets applique le taux des votes à tout paiement.
      const ticketCommissionBps = snapshot.money.ticketCommissionBps ?? snapshot.money.commissionBps;
      const published = await tx.event.updateMany({
        where: { id: event.id, status: EventStatus.DRAFT },
        data: { status: EventStatus.ACTIVE, commissionBps: snapshot.money.commissionBps, ticketCommissionBps, heldBps: snapshot.money.heldBps }
      });
      if (published.count === 0) {
        throw new ConflictException("Ce concours vient d'être modifié : rechargez la page.");
      }
      await tx.auditLog.create({
        data: {
          tenantId: event.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "contract.signed",
          targetType: "EventContract",
          targetId: contract.id,
          metadata: {
            eventId: event.id,
            contentHash: contract.contentHash,
            signedPdfSha256: sha256Hex(pdfBuffer),
            commissionBps: snapshot.money.commissionBps,
            ticketCommissionBps,
            heldBps: snapshot.money.heldBps
          }
        }
      });
    });

    await this.notifications.create(event.tenantId, NotificationType.CONTRACT_SIGNED, { eventId: event.id, contractId: contract.id });
    await this.sendSignedCopy(user.email, expectedName, event.title, contract.id, pdfBuffer);
    await this.notifications.create(event.tenantId, NotificationType.EVENT_ACTIVATED, { eventId: event.id, title: event.title });
    return { contractId: contract.id, signedAt, eventStatus: EventStatus.ACTIVE };
  }

  /** Copie du contrat signé envoyée à l'organisateur (best-effort : ne fait jamais échouer la signature). */
  private async sendSignedCopy(email: string, name: string, eventTitle: string, contractId: string, pdf: Buffer) {
    if (!this.mail) return;
    const sent = await this.mail.send({
      to: [email],
      subject: `Votre contrat signé — ${eventTitle}`,
      html: `<p>Bonjour ${escapeHtml(name)},</p><p>Vous trouverez ci-joint le contrat signé pour le concours « ${escapeHtml(eventTitle)} ». Votre concours est en ligne.</p><p>Conservez ce document : il est aussi téléchargeable à tout moment depuis votre espace SHADOMA.</p>`,
      text: `Votre contrat signé pour le concours « ${eventTitle} » est joint à ce message.`,
      attachments: [{ filename: `contrat-${contractId}-signe.pdf`, content: pdf }]
    });
    if (!sent) this.logger.warn(`Copie du contrat ${contractId} non envoyée par email.`);
  }

  /** PDF d'un contrat : l'original signé tel quel, sinon le projet à relire. */
  async getPdf(user: AuthUser, eventId: string, contractId: string) {
    const { contract } = await this.loadContract(user, eventId, contractId);
    return this.pdfOf(contract);
  }

  /** Administration : contrats d'un concours (preuves comprises). */
  async adminList(eventId: string) {
    return this.prisma.client.eventContract.findMany({
      where: { eventId },
      orderBy: { generatedAt: "desc" },
      select: { ...CONTRACT_SUMMARY, signerEmail: true, signerIp: true, otpVerifiedAt: true, signedPdfSha256: true }
    });
  }

  /** Administration : téléchargement d'un contrat, journalisé. */
  async adminPdf(admin: AuthUser, contractId: string) {
    const contract = await this.prisma.client.eventContract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException("Contrat introuvable.");
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: contract.tenantId,
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: "contract.downloaded_by_admin",
        targetType: "EventContract",
        targetId: contract.id
      }
    });
    return this.pdfOf(contract);
  }

  private async pdfOf(contract: { id: string; status: ContractStatus; snapshot: Prisma.JsonValue; generatedAt: Date; signedPdf: Uint8Array | null }) {
    const signed = contract.status === ContractStatus.SIGNED && contract.signedPdf;
    const bytes = signed
      ? Buffer.from(contract.signedPdf as Uint8Array)
      : Buffer.from(
          await renderContractPdf(buildContractDocument(contract.snapshot as unknown as ContractSnapshot, contract.id), {
            generatedAt: contract.generatedAt
          })
        );
    return { filename: `contrat-${contract.id}${signed ? "-signe" : "-projet"}.pdf`, bytes };
  }

  /** Seul le propriétaire du compte organisateur peut engager l'organisation. */
  private assertCanEngage(user: AuthUser) {
    if (user.role !== UserRole.ORGANIZER_OWNER) {
      throw new ForbiddenException("Seul le titulaire du compte organisateur peut signer le contrat.");
    }
  }

  private async loadEvent(user: AuthUser, eventId: string): Promise<EventForContract> {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      include: {
        ticketTypes: { where: { status: TicketTypeStatus.ACTIVE }, orderBy: { name: "asc" } },
        _count: { select: { candidates: true } }
      }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    return event;
  }

  private async loadContract(user: AuthUser, eventId: string, contractId: string) {
    const event = await this.loadEvent(user, eventId);
    const contract = await this.prisma.client.eventContract.findFirst({
      where: { id: contractId, eventId: event.id, tenantId: user.tenantId }
    });
    if (!contract) throw new NotFoundException("Contrat introuvable.");
    return { event, contract };
  }

  private async withContent(contractId: string) {
    const contract = await this.prisma.client.eventContract.findUniqueOrThrow({
      where: { id: contractId },
      select: { ...CONTRACT_SUMMARY, snapshot: true, contentHash: true }
    });
    const document = buildContractDocument(contract.snapshot as unknown as ContractSnapshot, contract.id);
    const { snapshot: _snapshot, ...summary } = contract;
    return { ...summary, document };
  }

  private async prefillIdentity(user: AuthUser): Promise<Partial<ContractIdentity>> {
    const last = await this.prisma.client.eventContract.findFirst({
      where: { tenantId: user.tenantId, status: ContractStatus.SIGNED },
      orderBy: { signedAt: "desc" },
      select: { snapshot: true }
    });
    if (last) {
      const { tenantId: _t, userId: _u, ...identity } = (last.snapshot as unknown as ContractSnapshot).organizer;
      return identity;
    }
    const account = await this.prisma.client.user.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true, phone: true, email: true, tenant: { select: { displayName: true } } }
    });
    return {
      firstName: account?.firstName ?? "",
      lastName: account?.lastName ?? "",
      phone: account?.phone ?? "",
      email: account?.email ?? user.email,
      organizationName: account?.tenant.displayName ?? ""
    };
  }

  private platformIdentity(): ContractSnapshot["platform"] {
    return {
      name: env.PLATFORM_LEGAL_NAME,
      legalForm: env.PLATFORM_LEGAL_FORM,
      address: env.PLATFORM_LEGAL_ADDRESS,
      registration: env.PLATFORM_LEGAL_REGISTRATION,
      representative: env.PLATFORM_LEGAL_REPRESENTATIVE,
      email: env.PLATFORM_LEGAL_EMAIL,
      jurisdiction: env.CONTRACT_JURISDICTION,
      publicUrl: env.APP_PUBLIC_URL
    };
  }

  private async buildSnapshot(
    event: EventForContract,
    user: AuthUser,
    identity: ContractIdentity,
    generatedAt: Date
  ): Promise<ContractSnapshot> {
    const [settings, commissionBps, ticketCommissionBps] = await Promise.all([
      this.offerSettings.getSettings(),
      this.offerSettings.resolveCommissionBps(event.id),
      this.offerSettings.resolveTicketCommissionBps(event.id)
    ]);
    return {
      templateVersion: CONTRACT_TEMPLATE_VERSION,
      generatedAt: generatedAt.toISOString(),
      legallyReviewed: env.CONTRACT_TEMPLATE_LEGALLY_REVIEWED,
      platform: this.platformIdentity(),
      organizer: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        phone: identity.phone,
        address: identity.address,
        idDocumentType: identity.idDocumentType,
        idDocumentNumber: identity.idDocumentNumber,
        organizationName: identity.organizationName,
        organizationLegalId: identity.organizationLegalId,
        tenantId: event.tenantId,
        userId: user.userId
      },
      event: {
        id: event.id,
        title: event.title,
        publicUrl: `${env.APP_PUBLIC_URL.replace(/\/+$/, "")}/e/${event.slug}`,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        voteUnitPriceCfa: event.voteUnitPriceCfa ?? 0,
        candidateCount: event._count.candidates,
        ticketTypes: event.ticketTypes.map((t) => ({ name: t.name, priceCfa: t.priceCfa, quantity: t.quantity }))
      },
      money: {
        commissionBps,
        ticketCommissionBps,
        heldBps: event.heldBps ?? settings.heldBps,
        heldReleaseDelayHours: settings.heldReleaseDelayHours
      }
    };
  }
}

const CONTRACT_SUMMARY = {
  id: true,
  eventId: true,
  status: true,
  templateVersion: true,
  generatedAt: true,
  signedAt: true,
  signerName: true,
  supersededAt: true
} as const;

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
