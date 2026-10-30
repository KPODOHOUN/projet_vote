import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  TicketStatus,
  UserRole
} from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { hashVoterPhone } from "../common/voter-phone";
import { paymentStatusToken, verifyPaymentStatusToken } from "../common/payment-status-token";
import { PaymentVerifyService } from "./payment-verify.service";
import { PspRegistry } from "./psp/psp.registry";
import { normalizePayinPhone, payinNetworksFor, resolvePayinNetwork } from "../common/mobile-operator";
import { env } from "../config/env";
import { OfferSettingsService } from "../offers/offer-settings.service";

/** Entrée commune de création d'un paiement (vote public ou votes ajoutés). */
type InitPaymentInput = z.infer<typeof _initPaymentSchema>;
const _initPaymentSchema = z.object({
  tenantId: z.string().min(1),
  eventId: z.string().min(1),
  voteId: z.string().min(1).optional(),
  amountCfa: z.number().int().positive().max(5_000_000),
  idempotencyKey: z.string().min(16),
  requestFingerprint: z.string().min(8).optional()
});

const initPublicPaymentSchema = z.object({
  tenantSlug: z.string().min(3).max(80),
  eventSlug: z.string().min(3).max(80),
  voteId: z.string().min(1),
  amountCfa: z.number().int().positive().max(5_000_000),
  idempotencyKey: z.string().min(16),
  requestFingerprint: z.string().min(8).optional(),
  // Payer MSISDN: mobile-money push targets this phone. Required because the
  // server (not a client widget) initiates the USSD prompt for FeexPay/FedaPay.
  payerPhone: z.string().min(8).max(20),
  // Réseau mobile money explicite (pan-africain). Optionnel : détection Bénin
  // par défaut si absent. Validé contre la liste blanche au moment du push.
  operator: z.string().min(2).max(20).optional()
});

const publicPaymentStatusSchema = z
  .object({
    tenantSlug: z.string().min(3).max(80),
    eventSlug: z.string().min(3).max(80),
    transactionId: z.string().min(1),
    // Auth du suivi public : SOIT le token de statut opaque (préféré — ne fuit
    // aucune PII dans les logs), SOIT le téléphone du votant (compat).
    statusToken: z.string().min(16).max(128).optional(),
    voterPhone: z.string().min(8).max(20).optional()
  })
  .refine((v) => Boolean(v.statusToken ?? v.voterPhone), {
    message: "statusToken ou voterPhone requis."
  });

/**
 * Webhook schema (ADR-017): we DO NOT trust the body for accounting. We only
 * extract the `reference` (or `order_id` fallback) to dispatch a server-to-
 * server verification call against Feexpay. The rest of the payload is parsed
 * for log/audit purposes only.
 */
const webhookTriggerSchema = z.object({
  reference: z.string().min(1).optional(),
  order_id: z.string().min(1).optional()
}).passthrough().refine(
  (v) => Boolean(v.reference ?? v.order_id),
  { message: "Webhook sans reference ni order_id." }
);

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifyService: PaymentVerifyService,
    private readonly pspRegistry: PspRegistry,
    private readonly offerSettings: OfferSettingsService
  ) {}

  /**
   * Per-transaction debounce for on-demand PSP pulls. Status polling and the SSE
   * stream both call verify-by-pull while a tx is PENDING; without this, a client
   * (or an attacker holding a transaction id) could force a server-to-server PSP
   * call every few seconds. Correctness never depends on this map — the webhook
   * and the reconciliation cron are the authoritative resolvers; it only caps
   * outbound cost/amplification. In-memory (per-instance) is sufficient for that.
   */
  private readonly lastPullAtByTx = new Map<string, number>();

  private shouldPullNow(transactionId: string): boolean {
    const now = Date.now();
    const last = this.lastPullAtByTx.get(transactionId) ?? 0;
    if (now - last < env.PSP_STATUS_PULL_MIN_INTERVAL_MS) {
      return false;
    }
    this.lastPullAtByTx.set(transactionId, now);
    if (this.lastPullAtByTx.size > 10_000) {
      const cutoff = now - env.PSP_STATUS_PULL_MIN_INTERVAL_MS * 4;
      for (const [key, value] of this.lastPullAtByTx) {
        if (value < cutoff) this.lastPullAtByTx.delete(key);
      }
    }
    return true;
  }

  async initOrganizerTopup(user: AuthUser, payload: unknown) {
    const schema = z.object({
      eventId: z.string().min(1),
      candidateId: z.string().min(1),
      votesCount: z.number().int().positive().max(1_000_000),
      idempotencyKey: z.string().min(16),
      payerPhone: z.string().min(8).max(20),
      operator: z.string().min(2).max(20).optional()
    });
    const input = schema.parse(payload);

    const event = await this.prisma.client.event.findFirst({
      where: { id: input.eventId, tenantId: user.tenantId }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    if (event.closedAt || event.status === "CLOSED" || event.status === "ARCHIVED") {
      throw new ConflictException("Impossible d'ajouter des votes sur un événement clôturé.");
    }
    const unitPrice = event.voteUnitPriceCfa;
    if (!unitPrice || unitPrice <= 0) {
      throw new BadRequestException("Définissez un prix unitaire de vote avant d'ajouter des votes.");
    }
    const candidate = await this.prisma.client.candidate.findFirst({
      where: { id: input.candidateId, eventId: event.id }
    });
    if (!candidate) throw new NotFoundException("Candidat introuvable.");

    const amountDueCfa = input.votesCount * unitPrice;

    const vote = await this.prisma.client.vote.create({
      data: {
        tenantId: user.tenantId,
        eventId: event.id,
        candidateId: candidate.id,
        amountCfa: amountDueCfa,
        votesCount: input.votesCount,
        voterPhoneLast4: "ORGA"
      }
    });

    const initResult = await this.initPaymentCore(
      {
        tenantId: user.tenantId,
        eventId: event.id,
        voteId: vote.id,
        amountCfa: amountDueCfa,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.payerPhone
      },
      "payments:organizer:topup",
      PaymentPurpose.ORGANIZER_VOTE_TOPUP
    );

    await this.prisma.client.paymentTransaction.update({
      where: { id: initResult.transactionId },
      data: { votesCount: input.votesCount }
    });

    if (env.API_PAYMENT_DEMO_MODE) {
      await this.assertNetworkAccepted(initResult.transactionId, input.operator, input.payerPhone);
      return this.maybeAutoConfirmDemoPayment(initResult.transactionId);
    }

    return this.triggerVotePayin({
      transactionId: initResult.transactionId,
      eventId: event.id,
      tenantId: user.tenantId,
      amountCfa: amountDueCfa,
      payerPhone: input.payerPhone,
      operator: input.operator,
      description: `Ajout votes — ${event.title}`
    });
  }

  async initPublicPayment(payload: unknown) {
    const input = initPublicPaymentSchema.parse(payload);
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug: input.tenantSlug.toLowerCase() }
    });
    if (!tenant) {
      throw new UnauthorizedException("Tenant introuvable.");
    }
    const event = await this.prisma.client.event.findFirst({
      where: {
        tenantId: tenant.id,
        slug: input.eventSlug.toLowerCase()
      }
    });
    if (!event) {
      throw new UnauthorizedException("Événement introuvable.");
    }
    const vote = await this.prisma.client.vote.findFirst({
      where: {
        id: input.voteId,
        tenantId: tenant.id,
        eventId: event.id
      }
    });
    if (!vote) {
      throw new UnauthorizedException("Vote introuvable.");
    }
    if (vote.amountCfa !== input.amountCfa) {
      throw new ConflictException("Montant du paiement différent du vote.");
    }
    const result = await this.initPaymentCore(
      {
        tenantId: tenant.id,
        eventId: event.id,
        voteId: vote.id,
        amountCfa: input.amountCfa,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint ?? input.payerPhone
      },
      "payments:public:init"
    );

    // Demo mode short-circuits the PSP entirely (dev/staging only).
    if (env.API_PAYMENT_DEMO_MODE) {
      // Même refus qu'en réel pour un réseau non accepté : la démo ne doit rien laisser passer de plus.
      await this.assertNetworkAccepted(result.transactionId, input.operator, input.payerPhone);
      const demo = await this.maybeAutoConfirmDemoPayment(result.transactionId);
      return { ...demo, statusToken: paymentStatusToken(demo.transactionId) };
    }

    // Real mode (ADR-017): the server MUST trigger the mobile-money push now.
    // Otherwise the transaction keeps providerRef=null and verify-by-pull can
    // never resolve it — the vote would stay unpaid forever.
    const pushed = await this.triggerVotePayin({
      transactionId: result.transactionId,
      eventId: event.id,
      tenantId: tenant.id,
      amountCfa: input.amountCfa,
      payerPhone: input.payerPhone,
      operator: input.operator,
      description: `Vote — ${event.title}`
    });
    // Opaque capability token so the front can poll status without ever putting
    // the voter's phone (PII) in a URL query string.
    return { ...pushed, statusToken: paymentStatusToken(pushed.transactionId) };
  }

  /**
   * Server-side mobile-money push for a public VOTE payment (ADR-017): the
   * PENDING tx is already created → ask the resolved PSP to
   * push the USSD prompt → bind the returned reference as providerRef so the
   * verify-by-pull pipeline can later confirm it server-to-server.
   *
   * Idempotent: if the transaction already carries a providerRef (a replayed
   * idempotency key), we never re-push — that would send a duplicate USSD
   * prompt. We just return the current snapshot.
   */
  private async triggerVotePayin(args: {
    transactionId: string;
    eventId: string;
    tenantId: string;
    amountCfa: number;
    payerPhone: string;
    operator?: string | undefined;
    description: string;
  }) {
    const tx = await this.prisma.client.paymentTransaction.findUnique({
      where: { id: args.transactionId }
    });
    if (!tx) {
      throw new NotFoundException("Transaction introuvable.");
    }
    if (tx.providerRef || tx.status !== PaymentStatus.PENDING) {
      return {
        transactionId: tx.id,
        provider: tx.provider,
        providerRef: tx.providerRef,
        status: tx.status
      };
    }

    const { operator, phoneNumber } = await this.acceptedNetworkOrFail(tx.id, tx.provider, args.operator, args.payerPhone);
    const gateway = this.pspRegistry.get(tx.provider);
    const creds = await this.pspRegistry.resolvePlatformCredentials(tx.provider);
    const payin = await gateway.initPayin(
      {
        amountCfa: args.amountCfa,
        phoneNumber,
        operator,
        customId: tx.id,
        description: args.description
      },
      creds
    );
    await this.attachProviderRef(tx.id, payin.reference);

    return {
      transactionId: tx.id,
      provider: tx.provider,
      providerRef: payin.reference,
      status: tx.status
    };
  }

  /** Réseaux proposés à l'organisateur (ajout de votes) : ceux du prestataire qui encaisse. */
  async getPayinNetworks(user: AuthUser, eventId?: string) {
    if (eventId) {
      const event = await this.prisma.client.event.findFirst({
        where: { id: eventId, tenantId: user.tenantId },
        select: { id: true }
      });
      if (!event) throw new NotFoundException("Événement introuvable.");
    }
    const provider = await this.pspRegistry.resolveProvider({ eventId, tenantId: user.tenantId });
    return { paymentNetworks: payinNetworksFor(provider) };
  }

  async getOrganizerPaymentStatus(user: AuthUser, transactionId: string) {
    const tx = await this.prisma.client.paymentTransaction.findFirst({
      where: { id: transactionId, tenantId: user.tenantId }
    });
    if (!tx) {
      throw new NotFoundException("Transaction introuvable.");
    }

    if (tx.status === PaymentStatus.PENDING && tx.providerRef) {
      if (env.API_PAYMENT_DEMO_MODE && tx.providerRef.startsWith("demo_")) {
        await this.confirmDemoPayment(tx.id);
      } else if (this.shouldPullNow(tx.id)) {
        await this.verifyService.verifyAndApplyByReference(tx.providerRef);
      }
    }

    const fresh = await this.prisma.client.paymentTransaction.findFirst({
      where: { id: transactionId, tenantId: user.tenantId }
    });
    if (!fresh) {
      throw new NotFoundException("Transaction introuvable.");
    }


    return {
      transactionId: fresh.id,
      status: fresh.status,
      provider: fresh.provider,
      providerRef: fresh.providerRef,
      purpose: fresh.purpose,
      amountCfa: fresh.amountCfa,
      eventId: fresh.eventId
    } as const;
  }

  async getPublicPaymentStatus(payload: unknown) {
    const input = publicPaymentStatusSchema.parse(payload);
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { slug: input.tenantSlug.toLowerCase() }
    });
    if (!tenant) {
      throw new UnauthorizedException("Tenant introuvable.");
    }
    const event = await this.prisma.client.event.findFirst({
      where: {
        tenantId: tenant.id,
        slug: input.eventSlug.toLowerCase()
      }
    });
    if (!event) {
      throw new UnauthorizedException("Événement introuvable.");
    }

    const transaction = await this.prisma.client.paymentTransaction.findFirst({
      where: {
        id: input.transactionId,
        tenantId: tenant.id,
        eventId: event.id
      }
    });
    if (!transaction || !transaction.voteId) {
      throw new UnauthorizedException("Transaction introuvable.");
    }

    // Authorize the read: the opaque status token (no PII) is preferred; the
    // voter phone (hash match) stays supported for backward compatibility.
    const vote = await this.prisma.client.vote.findFirst({
      where: {
        id: transaction.voteId,
        tenantId: tenant.id,
        eventId: event.id
      }
    });
    if (!vote) {
      throw new UnauthorizedException("Contexte de vote invalide.");
    }
    const tokenOk = input.statusToken
      ? verifyPaymentStatusToken(transaction.id, input.statusToken)
      : false;
    const phoneOk = (() => {
      if (tokenOk || !input.voterPhone) return tokenOk;
      const providedHash = Buffer.from(hashVoterPhone(input.voterPhone), "utf8");
      const storedHash = Buffer.from(vote.voterPhoneHash ?? "", "utf8");
      return (
        providedHash.length === storedHash.length && timingSafeEqual(providedHash, storedHash)
      );
    })();
    if (!tokenOk && !phoneOk) {
      throw new UnauthorizedException("Contexte de vote invalide.");
    }

    if (transaction.status === PaymentStatus.PENDING) {
      if (env.API_PAYMENT_DEMO_MODE) {
        await this.confirmDemoPayment(transaction.id);
      } else if (transaction.providerRef && this.shouldPullNow(transaction.id)) {
        await this.verifyService.verifyAndApplyByReference(transaction.providerRef);
      }
      const refreshed = await this.prisma.client.paymentTransaction.findFirst({
        where: { id: transaction.id }
      });
      if (refreshed) {
        Object.assign(transaction, refreshed);
      }
    }

    return {
      transactionId: transaction.id,
      status: transaction.status,
      provider: transaction.provider,
      providerRef: transaction.providerRef,
      updatedAt: transaction.updatedAt.toISOString()
    } as const;
  }

  /**
   * Create the PaymentTransaction row in PENDING state, then ask Feexpay to
   * initiate the actual mobile money push. The Feexpay `reference` is stored
   * as `providerRef` immediately so subsequent webhook/cron pulls can resolve
   * the transaction without trusting client-provided data.
   *
   * Idempotency: same idempotencyKey + same requestHash returns the existing
   * row (no new Feexpay call). Different requestHash for the same key is a
   * conflict (an attacker reusing a leaked idempotency key with a tampered
   * amount, for instance).
   */
  private async initPaymentCore(
    input: InitPaymentInput,
    scope: "payments:public:init" | "payments:organizer:topup",
    purpose: PaymentPurpose = PaymentPurpose.VOTE
  ) {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          tenantId: input.tenantId,
          eventId: input.eventId,
          voteId: input.voteId ?? null,
          amountCfa: input.amountCfa,
          requestFingerprint: input.requestFingerprint ?? null
        })
      )
      .digest("hex");

    const existing = await this.prisma.client.idempotencyKey.findUnique({
      where: { key: input.idempotencyKey }
    });
    if (existing) {
      if (existing.scope !== scope) {
        throw new ConflictException("Clé d'idempotence déjà utilisée pour une autre opération.");
      }
      if (existing.requestHash !== requestHash) {
        throw new ConflictException("Clé d'idempotence réutilisée avec une charge différente.");
      }
      // Replay: surface the previous PaymentTransaction unchanged (do NOT
      // re-call Feexpay; that would create a duplicate USSD push).
      const prior = await this.prisma.client.paymentTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (prior) {
        return {
          transactionId: prior.id,
          provider: prior.provider,
          providerRef: prior.providerRef,
          status: prior.status
        };
      }
    } else {
      await this.prisma.client.idempotencyKey.create({
        data: {
          key: input.idempotencyKey,
          scope,
          requestHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
    }

    // Multi-PSP routing: the provider is the organizer's choice, resolved from
    // the event override → tenant default → platform default. Persisted on the
    // transaction so verify-by-pull later routes through the same provider.
    const provider = await this.pspRegistry.resolveProvider({
      eventId: input.eventId,
      tenantId: input.tenantId
    });

    // Le paiement porte le nombre de voix du vote : les statistiques comptent
    // les mêmes voix que les résultats publics.
    const vote = input.voteId
      ? await this.prisma.client.vote.findUnique({ where: { id: input.voteId }, select: { votesCount: true } })
      : null;
    // Un vote n'a qu'une demande de paiement : après un refus, le votant recommence son vote.
    if (input.voteId && (await this.prisma.client.paymentTransaction.count({ where: { voteId: input.voteId } }))) {
      throw new ConflictException("Ce vote a déjà une demande de paiement. Recommencez votre vote.");
    }
    const tx = await this.prisma.client.paymentTransaction.create({
      data: {
        tenantId: input.tenantId,
        eventId: input.eventId,
        voteId: input.voteId ?? null,
        ...(vote ? { votesCount: vote.votesCount } : {}),
        provider,
        amountCfa: input.amountCfa,
        idempotencyKey: input.idempotencyKey,
        status: PaymentStatus.PENDING,
        purpose
      }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: "system:payments:init",
        actorRole: UserRole.PLATFORM_ADMIN,
        action: "payment.initiated",
        targetType: "PaymentTransaction",
        targetId: tx.id,
        metadata: { amountCfa: tx.amountCfa, provider: tx.provider }
      }
    });

    return {
      transactionId: tx.id,
      provider: tx.provider,
      providerRef: tx.providerRef,
      status: tx.status
    };
  }

  /**
   * Attach a Feexpay `providerRef` to an existing PaymentTransaction. Used by
   * the server-side flow that calls Feexpay's `requesttopay` endpoint after
   * `initPaymentCore`, or by the public flow that lets the JS SDK initiate
   * (in that case the front sends the reference back here once Feexpay
   * accepted the push).
   *
   * Safety: we can only set providerRef from null → value once. Subsequent
   * attempts are no-ops to prevent a second initiator from binding a
   * different Feexpay reference to the same internal transaction.
   */
  async attachProviderRef(transactionId: string, providerRef: string): Promise<void> {
    if (!providerRef) return;
    const result = await this.prisma.client.paymentTransaction.updateMany({
      where: { id: transactionId, providerRef: null },
      data: { providerRef }
    });
    if (result.count === 0) {
      // Either the tx doesn't exist or a providerRef is already bound. We do
      // NOT silently overwrite: if the bound reference is different, surface
      // the conflict so we can investigate.
      const tx = await this.prisma.client.paymentTransaction.findUnique({
        where: { id: transactionId },
        select: { providerRef: true }
      });
      if (tx && tx.providerRef && tx.providerRef !== providerRef) {
        throw new ConflictException("Cette transaction est déjà liée à une autre référence Feexpay.");
      }
    }
  }

  /**
   * ADR-017 webhook trigger. No HMAC, no body trust: we only extract the
   * provider reference and delegate to the verify-by-pull pipeline. Returns a
   * neutral acknowledgement so Feexpay does not retry on bad payloads.
   */
  async processWebhook(payload: unknown) {
    const parsed = webhookTriggerSchema.parse(payload);
    const reference = parsed.reference ?? parsed.order_id;
    if (!reference) {
      return { acknowledged: true, outcome: "rejected", reason: "missing_reference" } as const;
    }
    const result = await this.verifyService.verifyAndApplyByReference(reference);
    return { acknowledged: true, ...result };
  }

  /**
   * Billetterie : lance le paiement d'une transaction TICKET déjà créée, par le
   * même circuit que le vote (démo auto-confirmée, sinon push mobile money puis
   * verify-by-pull). Renvoie le jeton opaque qui autorise le suivi du statut.
   */
  async startTicketPayment(args: {
    transactionId: string;
    eventId: string;
    tenantId: string;
    amountCfa: number;
    payerPhone: string;
    operator?: string | undefined;
    description: string;
  }) {
    if (env.API_PAYMENT_DEMO_MODE) {
      await this.assertNetworkAccepted(args.transactionId, args.operator, args.payerPhone);
      const demo = await this.maybeAutoConfirmDemoPayment(args.transactionId);
      return { ...demo, statusToken: paymentStatusToken(demo.transactionId) };
    }
    const pushed = await this.triggerVotePayin(args);
    return { ...pushed, statusToken: paymentStatusToken(pushed.transactionId) };
  }

  /** Billetterie : statut d'un paiement TICKET, lisible uniquement avec son jeton. */
  async refreshTicketPayment(transactionId: string, statusToken: string) {
    if (!verifyPaymentStatusToken(transactionId, statusToken)) {
      throw new UnauthorizedException("Paiement introuvable.");
    }
    const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.purpose !== PaymentPurpose.TICKET) {
      throw new UnauthorizedException("Paiement introuvable.");
    }
    if (tx.status === PaymentStatus.PENDING) {
      if (env.API_PAYMENT_DEMO_MODE) {
        await this.confirmDemoPayment(tx.id);
      } else if (tx.providerRef && this.shouldPullNow(tx.id)) {
        await this.verifyService.verifyAndApplyByReference(tx.providerRef);
      }
    }
    const fresh = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
    return { transactionId, status: fresh?.status ?? tx.status };
  }

  /** Le réseau choisi doit être débitable par le prestataire de la transaction. */
  private async assertNetworkAccepted(transactionId: string, rawOperator: string | undefined, payerPhone: string) {
    const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId }, select: { provider: true } });
    if (tx) await this.acceptedNetworkOrFail(transactionId, tx.provider, rawOperator, payerPhone);
  }

  /** Réseau et numéro validés pour le prestataire ; sinon la transaction passe FAILED avant le refus. */
  private async acceptedNetworkOrFail(
    transactionId: string,
    provider: PaymentProvider,
    rawOperator: string | undefined,
    payerPhone: string
  ): Promise<{ operator: string; phoneNumber: string }> {
    try {
      return { operator: resolvePayinNetwork(rawOperator, provider), phoneNumber: normalizePayinPhone(payerPhone) };
    } catch (error) {
      await this.failRefusedPayment(transactionId);
      throw error;
    }
  }

  /** Paiement refusé avant tout envoi : il ne doit pas rester « en attente », et ses billets sont libérés. */
  private async failRefusedPayment(transactionId: string) {
    await this.prisma.client.$transaction([
      this.prisma.client.paymentTransaction.updateMany({
        where: { id: transactionId, status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] } },
        data: { status: PaymentStatus.FAILED }
      }),
      this.prisma.client.ticket.updateMany({
        where: { paymentTransactionId: transactionId, status: TicketStatus.RESERVED },
        data: { status: TicketStatus.CANCELLED }
      })
    ]);
  }

  private async maybeAutoConfirmDemoPayment(transactionId: string) {
    if (!env.API_PAYMENT_DEMO_MODE) {
      const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
      return {
        transactionId,
        provider: tx?.provider ?? "FEEXPAY",
        providerRef: tx?.providerRef ?? null,
        status: tx?.status ?? PaymentStatus.PENDING
      };
    }
    await this.attachProviderRef(transactionId, `demo_${transactionId}`);
    await this.confirmDemoPayment(transactionId);
    const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
    return {
      transactionId,
      provider: tx?.provider ?? "FEEXPAY",
      providerRef: tx?.providerRef ?? `demo_${transactionId}`,
      status: PaymentStatus.SUCCEEDED
    };
  }

  /** Confirme un paiement en mode démo (sans appel PSP). */
  private async confirmDemoPayment(transactionId: string): Promise<void> {
    const tx = await this.prisma.client.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.status !== PaymentStatus.PENDING) {
      return;
    }
    if (!tx.providerRef) {
      await this.attachProviderRef(transactionId, `demo_${transactionId}`);
    }
    await this.verifyService.applyDemoSuccess(transactionId);
  }
}
