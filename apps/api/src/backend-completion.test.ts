import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, InvitationStatus, PaymentProvider, UserRole } from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";
import { VotesService } from "./votes/votes.service";
import { EventsService } from "./events/events.service";
import { OrganizerSecretsService } from "./organizer-secrets/organizer-secrets.service";
import { PartnersService } from "./partners/partners.service";
import { noopPartnerNotifications } from "./partners/partner-notifications.stub";
import { candidateTestData } from "./test-utils/candidate-fixture";
import { PlatformSecretsService } from "./platform-control/platform-secrets.service";
import { InvitationsService } from "./invitations/invitations.service";
import { AuthService } from "./auth/auth.service";
import { PlatformControlService } from "./platform-control/platform-control.service";
import { VaultService } from "./platform-control/vault.service";
import { PaymentsService } from "./payments/payments.service";
import { PaymentVerifyService } from "./payments/payment-verify.service";
import { NotificationsService } from "./notifications/notifications.service";
import { MailService } from "./mail/mail.service";
import { PspRegistry } from "./payments/psp/psp.registry";
import { FeexpayGateway } from "./payments/psp/feexpay.gateway";
import { parseStrictProviderAmount } from "./payments/psp/parse-provider-amount";
import { FedapayGateway } from "./payments/psp/fedapay.gateway";
import { KkiapayGateway } from "./payments/psp/kkiapay.gateway";
import type { PspCredentials, PspPayinInitInput, PspPayinInitResult } from "./payments/psp/psp.types";
import type {
  FeexpayInitRequest,
  FeexpayInitResult,
  FeexpayStatusPayload
} from "./payments/feexpay/feexpay.types";
import { assertTestDatabase, prisma, resetDatabase } from "./test-utils/db";

/**
 * In-memory Feexpay client (ADR-017): tests script the next pull response per
 * reference. Used to drive the verify-by-pull pipeline without touching the
 * real network. Default: every reference reports SUCCESSFUL at the matching
 * tx amount so legacy "webhook says SUCCEEDED" tests keep their semantics.
 */
class FakeFeexpay {
  scripted = new Map<string, FeexpayStatusPayload>();
  defaultAmountByRef = new Map<string, number>();
  async initRequestToPay(req: FeexpayInitRequest): Promise<FeexpayInitResult> {
    const reference = `fp_${Math.random().toString(36).slice(2)}`;
    this.defaultAmountByRef.set(reference, req.amountCfa);
    return { reference, status: "PENDING", amount: req.amountCfa };
  }
  async fetchStatus(reference: string): Promise<FeexpayStatusPayload> {
    const scripted = this.scripted.get(reference);
    if (scripted) return scripted;
    // Default behaviour: confirm at the recorded amount (legacy happy-path).
    const amount = this.defaultAmountByRef.get(reference) ?? 0;
    return { status: "SUCCESSFUL", amount: String(amount), currency: "XOF" };
  }
}

class FakeFeexpayGateway extends FeexpayGateway {
  constructor(private readonly fake: FakeFeexpay) {
    super();
  }

  async initPayin(input: PspPayinInitInput, _creds: PspCredentials): Promise<PspPayinInitResult> {
    return {
      reference: `fp_activation_${input.customId ?? "test"}`,
      status: "PENDING",
      amountCfa: input.amountCfa
    };
  }

  async fetchPayinStatus(reference: string, _creds: PspCredentials): Promise<import("./payments/psp/psp.types").PspStatusResult> {
    const payload = await this.fake.fetchStatus(reference);
    const status =
      payload.status === "SUCCESSFUL"
        ? ("SUCCEEDED" as const)
        : payload.status === "FAILED"
          ? ("FAILED" as const)
          : ("PENDING" as const);
    return {
      status,
      amountCfa: parseStrictProviderAmount(payload.amount) ?? 0,
      providerAmount: payload.amount,
      currency: payload.currency ?? "XOF",
      reason: payload.reason
    };
  }
}

// Real-database tests for the backend completion features. No mock Prisma.
const prismaService = new PrismaService();
const notifications = new NotificationsService(prismaService);
const votes = new VotesService(prismaService);
const partners = new PartnersService(prismaService, noopPartnerNotifications());
const events = new EventsService(prismaService, votes, notifications, partners);
const secrets = new OrganizerSecretsService(prismaService);
const platformSecrets = new PlatformSecretsService(prismaService);
const invitations = new InvitationsService(prismaService, new MailService());
const auth = new AuthService(prismaService, notifications, new MailService());
const platform = new PlatformControlService(prismaService, new VaultService(prismaService));
const feexpay = new FakeFeexpay();
const pspRegistry = new PspRegistry(
  prismaService,
  secrets,
  platformSecrets,
  new FakeFeexpayGateway(feexpay),
  new FedapayGateway(),
  new KkiapayGateway()
);
const verifyService = new PaymentVerifyService(prismaService, notifications, pspRegistry);
const payments = new PaymentsService(prismaService, verifyService, pspRegistry);

/**
 * Helper bridging the OLD `processWebhook({providerRef, idempotencyKey, status})`
 * test-call shape to the ADR-017 verify-by-pull pipeline:
 *   1. bind providerRef to the existing PaymentTransaction
 *   2. script Feexpay's pull response
 *   3. trigger the webhook (Feexpay-style payload with `reference`)
 */
async function simulateFeexpayWebhook(opts: {
  idempotencyKey: string;
  providerRef: string;
  status: "SUCCEEDED" | "FAILED";
  amountCfa?: number;
}) {
  const tx = await prisma.paymentTransaction.findUnique({
    where: { idempotencyKey: opts.idempotencyKey }
  });
  if (!tx) throw new Error(`tx ${opts.idempotencyKey} introuvable`);
  await payments.attachProviderRef(tx.id, opts.providerRef);
  feexpay.scripted.set(opts.providerRef, {
    status: opts.status === "SUCCEEDED" ? "SUCCESSFUL" : "FAILED",
    amount: String(opts.amountCfa ?? tx.amountCfa),
    currency: "XOF"
  });
  return payments.processWebhook({ reference: opts.providerRef });
}

function admin(tenantId: string) {
  return { userId: "admin-1", tenantId, email: "admin@votezpro.africa", role: UserRole.PLATFORM_ADMIN };
}

before(() => assertTestDatabase());
beforeEach(async () => {
  await resetDatabase();
});
after(async () => {
  await prisma.$disconnect();
});

async function seedEventWithCandidates() {
  const tenant = await prisma.tenant.create({ data: { slug: "campus-africa", displayName: "Campus Africa" } });
  const now = Date.now();
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "miss-2026",
      title: "Miss 2026",
      status: EventStatus.ACTIVE,
      startsAt: new Date(now - 86_400_000),
      endsAt: new Date(now + 86_400_000),
      voteUnitPriceCfa: 500
    }
  });
  const c7 = await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "Arielle", number: 7 }) });
  const c8 = await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "Bola", number: 8 }) });
  return { tenant, event, c7, c8 };
}

function owner(tenantId: string): { userId: string; tenantId: string; email: string; role: UserRole } {
  return { userId: "owner-1", tenantId, email: "owner@campus-africa.bj", role: UserRole.ORGANIZER_OWNER };
}

test("résultats: seuls les votes PAYÉS et non annulés sont comptés", async () => {
  const { tenant, event, c7, c8 } = await seedEventWithCandidates();

  // Helper: créer un vote, et — si demandé — le paiement VOTE associé.
  const seedVote = async (
    candidateId: string,
    phone: string,
    opts: { paid: boolean; cancelled?: boolean } = { paid: true }
  ) => {
    const vote = await prisma.vote.create({
      data: {
        tenantId: tenant.id,
        eventId: event.id,
        candidateId,
        amountCfa: 500,
        voterPhoneLast4: phone.slice(-4),
        // paidAt is the tally gate (denormalized payment confirmation).
        ...(opts.paid ? { paidAt: new Date() } : {}),
        ...(opts.cancelled ? { cancelledAt: new Date(), cancelledReason: "fraude" } : {})
      }
    });
    if (opts.paid) {
      await prisma.paymentTransaction.create({
        data: {
          tenantId: tenant.id,
          eventId: event.id,
          voteId: vote.id,
          provider: PaymentProvider.FEEXPAY,
          amountCfa: 500,
          status: "SUCCEEDED",
          idempotencyKey: `paid-${phone}`
        }
      });
    }
    return vote;
  };

  await seedVote(c7.id, "1", { paid: true }); // compté
  await seedVote(c7.id, "2", { paid: true }); // compté
  await seedVote(c7.id, "3", { paid: false }); // INTÉGRITÉ : vote non payé → exclu
  await seedVote(c7.id, "4", { paid: true, cancelled: true }); // annulé → exclu
  await seedVote(c8.id, "5", { paid: true }); // compté

  const publicResults = await votes.getPublicEventResults("miss-2026");
  const r7 = publicResults.results.find((r) => r.candidateId === c7.id);
  const r8 = publicResults.results.find((r) => r.candidateId === c8.id);
  assert.equal(r7?.voteCount, 2); // non-payé + annulé exclus
  assert.equal(r8?.voteCount, 1);
  assert.equal(publicResults.totals.votes, 3);

  // Vue organisateur (tenant-scopée) : même décompte, même source de vérité
  const orgResults = await events.getEventResults(owner(tenant.id), event.id);
  assert.equal(orgResults.totals.votes, 3);
});

test("intégrité bout-en-bout: un vote ne compte qu'après webhook SUCCEEDED (paidAt)", async () => {
  const { tenant, event, c7 } = await seedEventWithCandidates();

  // 1. castVote crée un vote NON payé → ne compte pas encore.
  const vote = await votes.castVote({
    tenantSlug: tenant.slug,
    eventSlug: event.slug,
    candidateNumber: c7.number,
    quantity: 1,
    voterPhone: "22990000001"
  });
  assert.equal((await prisma.vote.findUnique({ where: { id: vote.id } }))?.paidAt, null);
  assert.equal((await votes.getPublicEventResults(event.slug)).totals.votes, 0);

  // 2. Paiement initié puis confirmé par le webhook signé.
  const init = await payments.initPublicPayment({
    tenantSlug: tenant.slug,
    eventSlug: event.slug,
    voteId: vote.id,
    amountCfa: 500,
    idempotencyKey: "vote-paid-idem-0001",
    payerPhone: "22990000001"
  });
  assert.equal(init.status, "PENDING");
  // The server-side payin push must have bound a providerRef — without it the
  // transaction could never be verified (this is the ADR-017 contract).
  const votePayinRef = init.providerRef;
  if (!votePayinRef) {
    throw new Error("initPublicPayment doit déclencher le push PSP et lier un providerRef");
  }
  await simulateFeexpayWebhook({
    providerRef: votePayinRef,
    idempotencyKey: "vote-paid-idem-0001",
    status: "SUCCEEDED"
  });

  // 3. paidAt posé → le vote compte désormais dans les résultats.
  assert.ok((await prisma.vote.findUnique({ where: { id: vote.id } }))?.paidAt);
  assert.equal((await votes.getPublicEventResults(event.slug)).totals.votes, 1);

  // 4. Vie privée (L7) : le téléphone brut n'est jamais stocké ; le suivi de
  // statut s'authentifie par hash — bon numéro → OK, mauvais → rejet.
  const stored = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal((stored as { voterPhone?: unknown }).voterPhone, undefined);
  assert.equal(stored?.voterPhoneLast4, "0001");

  const status = await payments.getPublicPaymentStatus({
    tenantSlug: tenant.slug,
    eventSlug: event.slug,
    transactionId: init.transactionId,
    voterPhone: "22990000001"
  });
  assert.equal(status.status, "SUCCEEDED");

  await assert.rejects(
    payments.getPublicPaymentStatus({
      tenantSlug: tenant.slug,
      eventSlug: event.slug,
      transactionId: init.transactionId,
      voterPhone: "22999999999"
    }),
    /Contexte de vote invalide/
  );
});

test("commission: chaîne événement → organisateur → plateforme", async () => {
  const { tenant } = await seedEventWithCandidates();
  const admin = { userId: "a", tenantId: tenant.id, email: "a@v.africa", role: UserRole.PLATFORM_ADMIN };

  assert.equal(await platform.resolveCommissionBps(null, null), 0); // rien configuré
  await platform.updateCommission(admin, { commissionBps: 1000 });
  assert.equal(await platform.resolveCommissionBps(null, null), 1000); // défaut plateforme
  assert.equal(await platform.resolveCommissionBps(null, 700), 700); // override organisateur
  assert.equal(await platform.resolveCommissionBps(300, 700), 300); // override événement gagne

  const res = await platform.setTenantCommission(admin, tenant.id, { commissionBps: 700 });
  assert.equal(res.commissionBps, 700);
  const refreshed = await prisma.tenant.findUnique({ where: { id: tenant.id } });
  assert.equal(refreshed?.commissionBps, 700);
});

test("secret de paiement par événement: override événement, fallback organisateur", async () => {
  const { tenant, event } = await seedEventWithCandidates();
  const user = owner(tenant.id);
  const key = "feexpay_api_secret";

  await secrets.saveSecret(user, { key, value: "COMPTE_ORGANISATEUR" });
  assert.equal(await secrets.resolvePaymentSecret(event.id, tenant.id, key), "COMPTE_ORGANISATEUR");

  await secrets.saveEventSecret(user, event.id, { key, value: "COMPTE_EVENEMENT" });
  assert.equal(await secrets.resolvePaymentSecret(event.id, tenant.id, key), "COMPTE_EVENEMENT");
  assert.equal((await secrets.getEventSecret(user, event.id, key)).value, "COMPTE_EVENEMENT");
});

test("invitation: création → acceptation crée un STAFF + tokens", async () => {
  const { tenant } = await seedEventWithCandidates();
  const user = owner(tenant.id);

  const invite = await invitations.createInvitation(user, {
    email: "staff@campus-africa.bj",
    role: UserRole.ORGANIZER_STAFF
  });
  assert.ok(invite.token.length >= 32);

  const accepted = await auth.acceptInvitation({ token: invite.token, password: "SecurePass123!" });
  assert.equal(typeof accepted.accessToken, "string");

  const staff = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: "staff@campus-africa.bj" } }
  });
  assert.equal(staff?.role, UserRole.ORGANIZER_STAFF);

  const invitationRow = await prisma.invitation.findUnique({ where: { id: invite.id } });
  assert.equal(invitationRow?.status, InvitationStatus.ACCEPTED);

  // Re-jouer le même token → refusé
  await assert.rejects(
    auth.acceptInvitation({ token: invite.token, password: "SecurePass123!" }),
    /Invitation invalide/
  );
});

test("invitation: refuse un e-mail déjà membre", async () => {
  const { tenant } = await seedEventWithCandidates();
  await prisma.user.create({
    data: { tenantId: tenant.id, email: "owner@campus-africa.bj", passwordHash: "x", role: UserRole.ORGANIZER_OWNER }
  });
  await assert.rejects(
    invitations.createInvitation(owner(tenant.id), {
      email: "owner@campus-africa.bj",
      role: UserRole.ORGANIZER_STAFF
    }),
    /déjà membre/
  );
});

test("activation: le forfait doit être payé pour activer (aucun quota gratuit)", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "org-act", displayName: "Org Act" } });
  await platform.updateSettings(admin(tenant.id), { activationFeeCfa: 25000 });

  const now = Date.now();
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "act-1",
      title: "act-1",
      status: EventStatus.DRAFT,
      startsAt: new Date(now - 86_400_000),
      endsAt: new Date(now + 86_400_000)
    }
  });
  const user = owner(tenant.id);

  // Forfait non payé → activation refusée (402)
  await assert.rejects(
    events.updateEvent(user, event.id, { status: "ACTIVE" }),
    /Forfait d'activation requis/
  );

  // Paiement du forfait → webhook confirmé → activation débloquée
  const init = await payments.initActivationPayment(user, {
    eventId: event.id,
    idempotencyKey: "activation-idem-000001",
    payerPhone: "2290166000000"
  });
  assert.equal(init.status, "PENDING");
  await simulateFeexpayWebhook({
    providerRef: init.providerRef ?? "fp_activation_1",
    idempotencyKey: "activation-idem-000001",
    status: "SUCCEEDED"
  });
  assert.ok((await prisma.event.findUnique({ where: { id: event.id } }))?.activationPaidAt);

  const activated = await events.updateEvent(user, event.id, { status: "ACTIVE" });
  assert.equal(activated.status, EventStatus.ACTIVE);

  // Le forfait d'activation NE génère PAS de commission.
  const tx = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: "activation-idem-000001" } });
  assert.equal(tx?.commissionCfa, null);
});

test("suppression de vote: définitive et SILENCIEUSE (aucun log d'audit)", async () => {
  const { tenant, event, c7 } = await seedEventWithCandidates();
  const vote = await prisma.vote.create({
    data: { tenantId: tenant.id, eventId: event.id, candidateId: c7.id, amountCfa: 500, voterPhoneLast4: "0001" }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 500,
      status: "SUCCEEDED",
      idempotencyKey: "del-idem-0001"
    }
  });

  const res = await platform.deleteVote(admin(tenant.id), vote.id);
  assert.equal(res.deleted, true);
  assert.equal(res.paymentVoided, true);
  // Option B+ : vote ET paiement PURGÉS du ledger principal.
  assert.equal(await prisma.vote.findUnique({ where: { id: vote.id } }), null);
  assert.equal(
    await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: "del-idem-0001" } }),
    null
  );
  // Trace chiffrée dans le coffre, kind=vote_deleted.
  const ventry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.equal(ventry.kind, "vote_deleted");
  assert.equal(await prisma.auditLog.count(), 0); // AUCUNE trace côté audit normal
});

test("commission: configuration ultra-silencieuse (aucun log d'audit)", async () => {
  const { tenant, event } = await seedEventWithCandidates();
  await platform.updateCommission(admin(tenant.id), { commissionBps: 1000 });
  await platform.setEventCommission(admin(tenant.id), event.id, { commissionBps: 500 });
  await platform.setTenantCommission(admin(tenant.id), tenant.id, { commissionBps: 700 });
  await platform.updateSettings(admin(tenant.id), { commissionBps: 800, activationFeeCfa: 10000 });
  assert.equal(await prisma.auditLog.count(), 0); // commission invisible dans l'audit
});
