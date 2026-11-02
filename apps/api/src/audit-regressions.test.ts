import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus, TicketStatus, UserRole } from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";
import { VotesService } from "./votes/votes.service";
import { EventsService } from "./events/events.service";
import { candidateTestData } from "./test-utils/candidate-fixture";
import { PlatformSecretsService } from "./platform-control/platform-secrets.service";
import { AuthService } from "./auth/auth.service";
import { AdminService } from "./admin/admin.service";
import { MaintenanceService } from "./maintenance/maintenance.service";
import { PrivacyService } from "./privacy/privacy.service";
import { PaymentsService } from "./payments/payments.service";
import { PaymentVerifyService } from "./payments/payment-verify.service";
import { PaymentReconciliationService } from "./payments/payment-reconciliation.service";
import { NotificationsService } from "./notifications/notifications.service";
import { MailService } from "./mail/mail.service";
import { PspRegistry } from "./payments/psp/psp.registry";
import { FeexpayGateway } from "./payments/psp/feexpay.gateway";
import { FedapayGateway } from "./payments/psp/fedapay.gateway";
import type { PspCredentials, PspPayinInitInput, PspPayinInitResult, PspStatusResult } from "./payments/psp/psp.types";
import { assertTestDatabase, prisma, resetDatabase } from "./test-utils/db";
import { OfferSettingsService } from "./offers/offer-settings.service";
import { WalletService } from "./offers/wallet.service";
import { hashVoterPhone } from "./common/voter-phone";
import { eventPreviewToken } from "./common/event-preview-token";

/**
 * Non-régression des défauts relevés par l'audit du 30/10/2026 : chaque test
 * rejoue le scénario fautif et exige le comportement correct.
 */

class ScriptedGateway extends FeexpayGateway {
  amounts = new Map<string, number>();
  status = new Map<string, "SUCCEEDED" | "PENDING" | "FAILED">();
  initCalls = 0;
  failNextInit = false;
  async initPayin(input: PspPayinInitInput, _c: PspCredentials): Promise<PspPayinInitResult> {
    this.initCalls += 1;
    if (this.failNextInit) {
      this.failNextInit = false;
      throw new Error("PSP: délai dépassé");
    }
    const reference = `ref_${input.customId}`;
    this.amounts.set(reference, input.amountCfa);
    return { reference, status: "PENDING", amountCfa: input.amountCfa };
  }
  async fetchPayinStatus(reference: string, _c: PspCredentials): Promise<PspStatusResult> {
    const amount = this.amounts.get(reference) ?? 0;
    return { status: this.status.get(reference) ?? "SUCCEEDED", amountCfa: amount, providerAmount: String(amount), currency: "XOF" };
  }
}

const prismaService = new PrismaService();
const notifications = new NotificationsService(prismaService);
const votes = new VotesService(prismaService);
const events = new EventsService(prismaService, votes, notifications);
const offerSettings = new OfferSettingsService(prismaService);
const wallet = new WalletService(prismaService);
const gateway = new ScriptedGateway();
const psp = new PspRegistry(prismaService, new PlatformSecretsService(prismaService), gateway, new FedapayGateway());
const verify = new PaymentVerifyService(prismaService, notifications, psp, wallet, offerSettings);
const payments = new PaymentsService(prismaService, verify, psp, offerSettings);
const reconcile = new PaymentReconciliationService(prismaService, verify);
const auth = new AuthService(prismaService, notifications, new MailService());
const admin = new AdminService(prismaService);
const maintenance = new MaintenanceService(prismaService);
const privacy = new PrivacyService(prismaService);

before(() => assertTestDatabase());
beforeEach(async () => {
  await resetDatabase();
  gateway.amounts.clear();
  gateway.status.clear();
  gateway.initCalls = 0;
  gateway.failNextInit = false;
});
after(() => prisma.$disconnect());

const PHONE = "22990000001";
const PASSWORD = "Password123!";

async function seed(status: EventStatus = EventStatus.ACTIVE) {
  const tenant = await prisma.tenant.create({ data: { slug: "audit-org", displayName: "Audit" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id, slug: "audit-evt", title: "Audit", status, voteUnitPriceCfa: 100,
      startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const c1 = await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "C1", number: 1 }) });
  const c2 = await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "C2", number: 2 }) });
  return { tenant, event, c1, c2 };
}

function ownerOf(tenantId: string) {
  return { userId: "owner", tenantId, role: UserRole.ORGANIZER_OWNER, email: "owner@audit.io" };
}

async function seedUser(tenantId: string, email: string, role: UserRole = UserRole.ORGANIZER_OWNER) {
  return prisma.user.create({
    data: { tenantId, email, role, passwordHash: await hash(PASSWORD, 4), emailVerifiedAt: new Date() }
  });
}

async function pendingTx(tenantId: string, eventId: string, i: number, ageMin: number) {
  return prisma.paymentTransaction.create({
    data: {
      tenantId, eventId, provider: PaymentProvider.FEEXPAY, providerRef: `stuck_${i}`,
      amountCfa: 100, status: PaymentStatus.PENDING, purpose: PaymentPurpose.VOTE,
      idempotencyKey: `audit-stuck-${i}-aaaaaaaaaaaa`, createdAt: new Date(Date.now() - ageMin * 60_000)
    }
  });
}

// ── Argent et résultats ──────────────────────────────────────────────────

test("un vote préparé pendant le concours ne se paie plus après la clôture", async () => {
  const { tenant, event } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 1, quantity: 50, voterPhone: PHONE });
  await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.CLOSED, closedAt: new Date() } });

  await assert.rejects(
    payments.initPublicPayment({
      tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 5000,
      idempotencyKey: "audit-closed-idem-0001", payerPhone: PHONE, operator: "mtn"
    }),
    /n'est pas ouvert au vote/
  );
  assert.equal(gateway.initCalls, 0);
  assert.equal(await prisma.paymentTransaction.count(), 0);
});

test("un vote ne se paie plus une fois la date de fin passée, même avant la clôture automatique", async () => {
  const { tenant, event } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 1, quantity: 1, voterPhone: PHONE });
  await prisma.event.update({ where: { id: event.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  await assert.rejects(
    payments.initPublicPayment({
      tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
      idempotencyKey: "audit-ended-idem-00001", payerPhone: PHONE, operator: "mtn"
    }),
    /fermé/
  );
});

test("l'organisateur n'ajoute pas de votes à un concours en brouillon", async () => {
  const { tenant, event, c1 } = await seed(EventStatus.DRAFT);
  await assert.rejects(
    payments.initOrganizerTopup(ownerOf(tenant.id), {
      eventId: event.id, candidateId: c1.id, votesCount: 10, idempotencyKey: "audit-topup-draft-0001", payerPhone: PHONE, operator: "mtn"
    }),
    /n'est pas ouvert au vote/
  );
  assert.equal(await prisma.vote.count(), 0);
});

test("un candidat dont un paiement est en cours ne peut pas être supprimé", async () => {
  const { tenant, event, c2 } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 2, quantity: 1, voterPhone: PHONE });
  const init = await payments.initPublicPayment({
    tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
    idempotencyKey: "audit-delcand-idem-0001", payerPhone: PHONE, operator: "mtn"
  });
  await assert.rejects(events.deleteCandidate(ownerOf(tenant.id), event.id, c2.id), /paiement est en cours/);

  // Le paiement confirmé compte normalement.
  assert.equal((await verify.verifyAndApplyByReference(init.providerRef!)).outcome, "applied");
  assert.equal((await votes.getPublicEventResults(event.slug)).totals.votes, 1);
});

test("un candidat dont le paiement a échoué redevient supprimable", async () => {
  const { tenant, event, c2 } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 2, quantity: 1, voterPhone: PHONE });
  const init = await payments.initPublicPayment({
    tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
    idempotencyKey: "audit-delcand-idem-0002", payerPhone: PHONE, operator: "mtn"
  });
  gateway.status.set(init.providerRef!, "FAILED");
  await verify.verifyAndApplyByReference(init.providerRef!);
  assert.deepEqual(await events.deleteCandidate(ownerOf(tenant.id), event.id, c2.id), { deleted: true });
});

test("la réconciliation traite les paiements récents malgré des paiements bloqués plus anciens", async () => {
  const { tenant, event } = await seed();
  await pendingTx(tenant.id, event.id, 1, 600);
  await pendingTx(tenant.id, event.id, 2, 500);
  gateway.status.set("stuck_1", "PENDING");
  gateway.status.set("stuck_2", "PENDING");
  const fresh = await pendingTx(tenant.id, event.id, 3, 10);
  gateway.amounts.set("stuck_3", 100);

  for (let tick = 0; tick < 3; tick++) await reconcile.reconcilePending({ limit: 2 });
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: fresh.id } })).status, PaymentStatus.SUCCEEDED);
});

test("la réconciliation abandonne un paiement resté en attente chez le prestataire au-delà du délai", async () => {
  const { tenant, event } = await seed();
  const old = await pendingTx(tenant.id, event.id, 1, 25 * 60);
  const recent = await pendingTx(tenant.id, event.id, 2, 30);
  gateway.status.set("stuck_1", "PENDING");
  gateway.status.set("stuck_2", "PENDING");

  const summary = await reconcile.reconcilePending();
  assert.equal(summary.abandoned, 1);
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: old.id } })).status, PaymentStatus.FAILED);
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: recent.id } })).status, PaymentStatus.PENDING);
  assert.equal(await prisma.auditLog.count({ where: { action: "payment.abandoned_pending", targetId: old.id } }), 1);
});

test("un envoi USSD en échec clôt la transaction : rejouer la même clé ne relance pas d'envoi", async () => {
  const { tenant, event } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 1, quantity: 1, voterPhone: PHONE });
  const body = {
    tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
    idempotencyKey: "audit-push-fail-idem-01", payerPhone: PHONE, operator: "mtn"
  };
  gateway.failNextInit = true;
  await assert.rejects(payments.initPublicPayment(body), /délai dépassé/);
  const tx = await prisma.paymentTransaction.findFirstOrThrow();
  assert.equal(tx.status, PaymentStatus.FAILED);

  const replay = await payments.initPublicPayment(body);
  assert.equal(replay.status, PaymentStatus.FAILED);
  assert.equal(gateway.initCalls, 1, "aucun second envoi USSD");
});

test("une référence prestataire reçue avant l'échec de l'envoi reste liée : pas de second envoi, la réconciliation tranche", async () => {
  const { tenant, event } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 1, quantity: 1, voterPhone: PHONE });
  const original = gateway.initPayin.bind(gateway);
  gateway.initPayin = async (input) => {
    await input.onReference?.(`ref_${input.customId}`);
    gateway.initCalls += 1;
    throw new Error("PSP: délai dépassé à l'envoi");
  };
  try {
    await assert.rejects(
      payments.initPublicPayment({
        tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
        idempotencyKey: "audit-push-ref-idem-001", payerPhone: PHONE, operator: "mtn"
      }),
      /délai dépassé/
    );
  } finally {
    gateway.initPayin = original;
  }
  const tx = await prisma.paymentTransaction.findFirstOrThrow();
  assert.equal(tx.status, PaymentStatus.PENDING);
  assert.equal(tx.providerRef, `ref_${tx.id}`);
});

test("supprimer un membre d'équipe ne supprime que ce membre", async () => {
  const { tenant, event } = await seed();
  const platform = await prisma.tenant.create({ data: { slug: "platform-hq", displayName: "Plateforme" } });
  await seedUser(tenant.id, "owner@audit.io");
  const staff = await seedUser(tenant.id, "staff@audit.io", UserRole.ORGANIZER_STAFF);
  await prisma.organizerWallet.create({ data: { tenantId: tenant.id, withdrawableCfa: 250_000, heldCfa: 50_000 } });
  const superAdmin = { userId: "sa", tenantId: platform.id, role: UserRole.PLATFORM_SUPER_ADMIN, email: "sa@x.io" };

  await admin.deleteUser(superAdmin, staff.id);

  assert.equal(await prisma.user.count({ where: { id: staff.id } }), 0);
  assert.equal(await prisma.tenant.count({ where: { id: tenant.id } }), 1);
  assert.equal(await prisma.event.count({ where: { id: event.id } }), 1);
  assert.equal(await prisma.user.count({ where: { email: "owner@audit.io" } }), 1);
  assert.equal((await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } })).withdrawableCfa, 250_000);
  assert.equal(await prisma.auditLog.count({ where: { action: "user.deleted", targetId: staff.id } }), 1);
});

test("le dernier responsable d'une organisation qui a de l'activité n'est pas supprimable", async () => {
  const { tenant } = await seed();
  const platform = await prisma.tenant.create({ data: { slug: "platform-hq", displayName: "Plateforme" } });
  const owner = await seedUser(tenant.id, "owner@audit.io");
  const superAdmin = { userId: "sa", tenantId: platform.id, role: UserRole.PLATFORM_SUPER_ADMIN, email: "sa@x.io" };

  await assert.rejects(admin.deleteUser(superAdmin, owner.id), /suspendez/);
  assert.equal(await prisma.tenant.count({ where: { id: tenant.id } }), 1);
});

test("le dernier responsable d'une organisation vide est supprimé avec elle, et la suppression reste tracée", async () => {
  const empty = await prisma.tenant.create({ data: { slug: "empty-org", displayName: "Vide" } });
  const platform = await prisma.tenant.create({ data: { slug: "platform-hq", displayName: "Plateforme" } });
  const owner = await seedUser(empty.id, "owner@empty.io");
  const superAdmin = { userId: "sa", tenantId: platform.id, role: UserRole.PLATFORM_SUPER_ADMIN, email: "sa@x.io" };

  await admin.deleteUser(superAdmin, owner.id);
  assert.equal(await prisma.tenant.count({ where: { id: empty.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { action: "user.deleted", targetId: owner.id, tenantId: platform.id } }), 1);
});

// ── Sécurité ─────────────────────────────────────────────────────────────

test("des échecs de connexion en parallèle ne testent pas plus de 5 mots de passe", async () => {
  const { tenant } = await seed();
  await seedUser(tenant.id, "victim@audit.io");
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => auth.login({ tenantSlug: tenant.slug, email: "victim@audit.io", password: "WrongPass999" }))
  );
  const messages = results.map((r) => (r.status === "rejected" ? (r.reason as Error).message : "ok"));
  const invalid = messages.filter((m) => /Identifiants invalides/.test(m)).length;
  const locked = messages.filter((m) => /verrouillé/.test(m)).length;
  assert.ok(invalid <= 5, `${invalid} mots de passe testés`);
  assert.equal(invalid + locked, 20);
  const row = await prisma.loginAttempt.findFirstOrThrow();
  assert.ok(row.lockedUntil && row.lockedUntil.getTime() > Date.now());
});

test("deux refresh simultanés du même cookie : une seule rotation, aucune déconnexion", async () => {
  const { tenant } = await seed();
  await seedUser(tenant.id, "owner@audit.io");
  const { refreshToken } = await auth.login({ tenantSlug: tenant.slug, email: "owner@audit.io", password: PASSWORD });

  const results = await Promise.all([auth.refresh({ refreshToken }), auth.refresh({ refreshToken })]);
  assert.ok(results.every((r) => r.accessToken));
  assert.equal(results.filter((r) => r.refreshToken).length, 1, "un seul nouveau cookie");
  assert.equal(await prisma.authSession.count({ where: { revokedAt: null } }), 1);

  // Le même cookie rejoué juste après (autre onglet) : accès accordé, rien n'est révoqué.
  const late = await auth.refresh({ refreshToken });
  assert.ok(late.accessToken);
  assert.equal(late.refreshToken, undefined);
  assert.equal(await prisma.authSession.count({ where: { revokedAt: null } }), 1);
});

test("un cookie déjà tourné rejoué après la période de grâce révoque toute la chaîne", async () => {
  const { tenant } = await seed();
  await seedUser(tenant.id, "owner@audit.io");
  const { refreshToken } = await auth.login({ tenantSlug: tenant.slug, email: "owner@audit.io", password: PASSWORD });
  await auth.refresh({ refreshToken });
  await prisma.authSession.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });

  await assert.rejects(auth.refresh({ refreshToken }), /réutilisation détectée/);
  assert.equal(await prisma.authSession.count({ where: { revokedAt: null } }), 0);
});

test("un cookie révoqué par déconnexion n'ouvre pas de période de grâce", async () => {
  const { tenant } = await seed();
  await seedUser(tenant.id, "owner@audit.io");
  const { refreshToken } = await auth.login({ tenantSlug: tenant.slug, email: "owner@audit.io", password: PASSWORD });
  await auth.logout({ refreshToken });
  await assert.rejects(auth.refresh({ refreshToken }), /réutilisation détectée/);
});

test("l'empreinte du numéro de votant n'est plus un SHA-256 public, et les anciennes empreintes restent reconnues", async () => {
  const legacy = createHash("sha256").update(`votezpro:phone:${PHONE}`).digest("hex");
  assert.notEqual(hashVoterPhone(PHONE), legacy);

  const { tenant, event } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 1, quantity: 1, voterPhone: PHONE });
  const init = await payments.initPublicPayment({
    tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
    idempotencyKey: "audit-phone-idem-00001", payerPhone: PHONE, operator: "mtn"
  });
  const lookup = () => payments.getPublicPaymentStatus({ tenantSlug: tenant.slug, eventSlug: event.slug, transactionId: init.transactionId, voterPhone: PHONE });
  assert.equal((await lookup()).transactionId, init.transactionId);

  await prisma.vote.update({ where: { id: vote.id }, data: { voterPhoneHash: legacy } });
  assert.equal((await lookup()).transactionId, init.transactionId);
});

test("la suppression de compte retire la liaison Google et bloque toute reconnexion", async () => {
  const { tenant } = await seed();
  const user = await seedUser(tenant.id, "staff@audit.io", UserRole.ORGANIZER_STAFF);
  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "google", providerAccountId: "g-123", email: "staff@audit.io", displayName: "Staff", photoUrl: "https://x/p.png" }
  });
  await privacy.anonymizeUserData({ userId: user.id, tenantId: tenant.id, role: user.role, email: user.email }, { currentPassword: PASSWORD });

  assert.equal(await prisma.oAuthAccount.count({ where: { userId: user.id } }), 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt, null);
});

test("le journal d'audit financier ne s'efface ni par purge ni par suppression", async () => {
  const { tenant } = await seed();
  const old = new Date(Date.now() - 4000 * 24 * 3600_000);
  const money = await prisma.auditLog.create({
    data: { tenantId: tenant.id, actorUserId: "system", actorRole: UserRole.PLATFORM_ADMIN, action: "payment.verified_applied", targetType: "PaymentTransaction", createdAt: old }
  });
  await prisma.auditLog.create({
    data: { tenantId: tenant.id, actorUserId: "system", actorRole: UserRole.PLATFORM_ADMIN, action: "auth.login", targetType: "User", createdAt: old }
  });
  const platformAdmin = { userId: "pa", tenantId: tenant.id, role: UserRole.PLATFORM_ADMIN, email: "pa@x.io" };

  await assert.rejects(maintenance.purge(platformAdmin, { auditLogsRetentionDays: 0 }));
  await maintenance.purge(platformAdmin, { auditLogsRetentionDays: 365 });
  assert.equal(await prisma.auditLog.count({ where: { id: money.id } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "auth.login" } }), 0);

  await assert.rejects(admin.deleteAuditLog(platformAdmin, money.id), /conservée/);
  await assert.rejects(admin.bulkDeleteAuditLogs(platformAdmin, { ids: [money.id] }), /conservée/);
  await admin.deleteAuditLogsMatching(platformAdmin, { action: "payment.verified_applied" });
  assert.equal(await prisma.auditLog.count({ where: { id: money.id } }), 1);
});

// ── Robustesse ───────────────────────────────────────────────────────────

test("un concours en brouillon n'est pas public, sauf avec le jeton d'aperçu de l'organisateur", async () => {
  const { tenant, event } = await seed(EventStatus.DRAFT);
  await assert.rejects(votes.getPublicEventBySlug(event.slug), /introuvable/);
  await assert.rejects(votes.getPublicEventResults(event.slug), /introuvable/);
  const ref = (await prisma.candidate.findFirstOrThrow({ where: { eventId: event.id } })).publicRef;
  await assert.rejects(votes.getPublicCandidate(event.slug, ref), /introuvable/);
  assert.equal((await votes.listPublicEvents(tenant.slug)).length, 0);

  const token = eventPreviewToken(event.id);
  assert.equal((await votes.getPublicEventBySlug(event.slug, token)).event.slug, event.slug);
  assert.equal((await votes.getPublicCandidate(event.slug, ref, token)).candidate.publicRef, ref);
  assert.equal((await votes.getPublicEventResults(event.slug, token)).event.slug, event.slug);
  await assert.rejects(votes.getPublicEventBySlug(event.slug, "jeton-faux-0123456789"), /introuvable/);
});

test("deux premiers crédits simultanés d'une organisation créent un seul portefeuille, sans échec", async () => {
  const { tenant } = await seed();
  await Promise.all(
    [1, 2, 3].map(() =>
      prisma.$transaction((trx) =>
        wallet.credit({ tenantId: tenant.id, amountCfa: 100, kind: "ADJUSTMENT", target: "withdrawable" }, trx)
      )
    )
  );
  const w = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(w.withdrawableCfa, 300);
});

test("votes ajoutés par l'organisateur : payés au prix normal, commission du contrat comme un vote normal", async () => {
  const { tenant, event, c1 } = await seed();
  await prisma.event.update({ where: { id: event.id }, data: { commissionBps: 1200 } });
  const init = await payments.initOrganizerTopup(ownerOf(tenant.id), {
    eventId: event.id, candidateId: c1.id, votesCount: 10, idempotencyKey: "audit-topup-commission-01", payerPhone: PHONE, operator: "mtn"
  });
  await verify.verifyAndApplyByReference(init.providerRef!);
  const tx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: init.transactionId } });
  assert.equal(tx.status, PaymentStatus.SUCCEEDED);
  assert.equal(tx.amountCfa, 1000, "10 voix × 100 FCFA : 100 % du prix unitaire");
  assert.equal(tx.commissionCfa, 120, "12 % comme un vote normal");
  assert.equal(tx.commissionCfa, offerSettings.computeCommissionCfa(1000, 1200), "même calcul qu'un vote public");
  const wallet = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(wallet.withdrawableCfa + wallet.heldCfa, 880, "l'organisateur reçoit le net, comme pour un vote normal");
});

/** Achat de `count` billets (prix 1 000) en attente de paiement depuis `ageMin` minutes. */
async function pendingTicketPurchase(tenantId: string, eventId: string, ticketTypeId: string, i: number, ageMin: number, count = 1) {
  const createdAt = new Date(Date.now() - ageMin * 60_000);
  const tx = await prisma.paymentTransaction.create({
    data: {
      tenantId, eventId, provider: PaymentProvider.FEEXPAY, providerRef: `tkt_${i}`,
      amountCfa: 1000 * count, status: PaymentStatus.PENDING, purpose: PaymentPurpose.TICKET,
      idempotencyKey: `audit-ticket-${i}-aaaaaaaaaaaa`, createdAt
    }
  });
  gateway.amounts.set(`tkt_${i}`, 1000 * count);
  for (let n = 0; n < count; n++) {
    await prisma.ticket.create({
      data: { ticketTypeId, eventId, qrSecret: `qr_${i}_${n}`, amountCfa: 1000, paymentTransactionId: tx.id, createdAt }
    });
  }
  return tx;
}

test("billets : la plateforme prélève 10 % de chaque billet vendu, quel que soit le taux des votes", async () => {
  const { tenant, event } = await seed();
  await prisma.event.update({ where: { id: event.id }, data: { commissionBps: 1200 } });
  const type = await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 10 } });
  const tx = await pendingTicketPurchase(tenant.id, event.id, type.id, 1, 1, 3);
  assert.equal((await verify.verifyAndApplyByReference("tkt_1")).outcome, "applied");
  const paid = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } });
  assert.equal(paid.commissionCfa, 300, "10 % de 3 000 FCFA");
  const w = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(w.withdrawableCfa + w.heldCfa, 2700);
});

test("billets : le taux figé par le contrat du concours prime sur le réglage plateforme", async () => {
  const { tenant, event } = await seed();
  await prisma.event.update({ where: { id: event.id }, data: { ticketCommissionBps: 800 } });
  await offerSettings.updateSettings({ ...ownerOf(tenant.id), role: UserRole.PLATFORM_SUPER_ADMIN }, { ticketCommissionBps: 1500 });
  const type = await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 10 } });
  const tx = await pendingTicketPurchase(tenant.id, event.id, type.id, 1, 1);
  await verify.verifyAndApplyByReference("tkt_1");
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).commissionCfa, 80);
  assert.equal(await offerSettings.resolveTicketCommissionBps(event.id), 800);
});

test("billets : un achat non payé ne bloque les places que 15 minutes", async () => {
  const { tenant, event } = await seed();
  const type = await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 2 } });
  const stale = await pendingTicketPurchase(tenant.id, event.id, type.id, 1, 16, 2);
  const fresh = await pendingTicketPurchase(tenant.id, event.id, type.id, 2, 5);
  gateway.status.set("tkt_1", "PENDING");
  gateway.status.set("tkt_2", "PENDING");
  // Sans référence prestataire non plus : libéré au même délai.
  const orphan = await prisma.paymentTransaction.update({ where: { id: (await pendingTicketPurchase(tenant.id, event.id, type.id, 3, 16)).id }, data: { providerRef: null } });

  await reconcile.reconcilePending();
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: stale.id } })).status, PaymentStatus.FAILED);
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: orphan.id } })).status, PaymentStatus.FAILED);
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: fresh.id } })).status, PaymentStatus.PENDING);
  assert.equal(await prisma.ticket.count({ where: { paymentTransactionId: stale.id, status: TicketStatus.CANCELLED } }), 2, "places rendues à la vente");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.abandoned_pending", targetId: stale.id } });
  assert.deepEqual((audit.metadata as { reason: string }).reason, "ticket_hold_timeout");
});

test("billets : un paiement confirmé après l'abandon est honoré si les places sont encore libres", async () => {
  const { tenant, event } = await seed();
  const type = await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 5 } });
  const tx = await pendingTicketPurchase(tenant.id, event.id, type.id, 1, 20, 2);
  gateway.status.set("tkt_1", "PENDING");
  await reconcile.reconcilePending();
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).status, PaymentStatus.FAILED);

  gateway.status.set("tkt_1", "SUCCEEDED");
  const [a, b] = await Promise.all([verify.verifyAndApplyByReference("tkt_1"), verify.verifyAndApplyByReference("tkt_1")]);
  assert.deepEqual([a.outcome, b.outcome].sort(), ["applied", "ignored_terminal"], "deux webhooks simultanés : un seul effet");
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).status, PaymentStatus.SUCCEEDED);
  const tickets = await prisma.ticket.findMany({ where: { paymentTransactionId: tx.id }, orderBy: { number: "asc" } });
  assert.deepEqual(tickets.map((t) => [t.status, t.number]), [[TicketStatus.PAID, 1], [TicketStatus.PAID, 2]]);
  assert.equal(await prisma.auditLog.count({ where: { action: "payment.late_success_needs_refund" } }), 0);
});

test("billets : un paiement tardif sans place libre n'est pas survendu, il est signalé pour remboursement", async () => {
  const { tenant, event } = await seed();
  const type = await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 1 } });
  const late = await pendingTicketPurchase(tenant.id, event.id, type.id, 1, 20);
  gateway.status.set("tkt_1", "PENDING");
  await reconcile.reconcilePending();
  // La place libérée est revendue et payée.
  await pendingTicketPurchase(tenant.id, event.id, type.id, 2, 1);
  await verify.verifyAndApplyByReference("tkt_2");

  gateway.status.set("tkt_1", "SUCCEEDED");
  const result = await verify.verifyAndApplyByReference("tkt_1");
  await verify.verifyAndApplyByReference("tkt_1");
  assert.equal(result.reason, "late_success_needs_refund");
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: late.id } })).status, PaymentStatus.FAILED);
  assert.equal(await prisma.ticket.count({ where: { ticketTypeId: type.id, status: TicketStatus.PAID } }), 1, "jamais plus de billets que de places");
  assert.equal(await prisma.auditLog.count({ where: { action: "payment.late_success_needs_refund", targetId: late.id } }), 1, "signalé une seule fois");
});

test("un échec signalé par le prestataire reste définitif : pas de reprise tardive", async () => {
  const { tenant, event } = await seed();
  const type = await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 5 } });
  const tx = await pendingTicketPurchase(tenant.id, event.id, type.id, 1, 1);
  gateway.status.set("tkt_1", "FAILED");
  await verify.verifyAndApplyByReference("tkt_1");
  gateway.status.set("tkt_1", "SUCCEEDED");
  assert.equal((await verify.verifyAndApplyByReference("tkt_1")).outcome, "ignored_terminal");
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).status, PaymentStatus.FAILED);
});

test("vote abandonné puis confirmé tardivement : compté si le concours est ouvert, sinon signalé pour remboursement", async () => {
  const { tenant, event } = await seed();
  const vote = await votes.castVote({ tenantSlug: tenant.slug, eventSlug: event.slug, candidateNumber: 1, quantity: 1, voterPhone: PHONE });
  const open = await payments.initPublicPayment({
    tenantSlug: tenant.slug, eventSlug: event.slug, voteId: vote.id, amountCfa: 100,
    idempotencyKey: "audit-late-vote-open-01", payerPhone: PHONE, operator: "mtn"
  });
  const ref = open.providerRef!;
  await prisma.paymentTransaction.update({ where: { id: open.transactionId }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
  gateway.status.set(ref, "PENDING");
  await reconcile.reconcilePending();
  gateway.status.set(ref, "SUCCEEDED");
  assert.equal((await verify.verifyAndApplyByReference(ref)).outcome, "applied");
  const tx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: open.transactionId } });
  assert.notEqual((await prisma.vote.findUniqueOrThrow({ where: { id: tx.voteId! } })).paidAt, null);

  const closed = await pendingTx(tenant.id, event.id, 9, 25 * 60);
  gateway.status.set("stuck_9", "PENDING");
  await reconcile.reconcilePending();
  await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.CLOSED } });
  gateway.status.set("stuck_9", "SUCCEEDED");
  gateway.amounts.set("stuck_9", 100);
  assert.equal((await verify.verifyAndApplyByReference("stuck_9")).reason, "late_success_needs_refund");
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: closed.id } })).status, PaymentStatus.FAILED);
});

test("billetterie d'un brouillon : invisible publiquement, lisible avec le jeton d'aperçu", async () => {
  const { TicketsService } = await import("./tickets/tickets.service");
  const tickets = new TicketsService(prismaService, new MailService(), payments, psp);
  const { event } = await seed(EventStatus.DRAFT);
  await prisma.ticketType.create({ data: { eventId: event.id, name: "Standard", priceCfa: 1000, quantity: 10 } });
  await assert.rejects(tickets.listPublicTicketTypes(event.slug), /introuvable/);
  assert.equal((await tickets.listPublicTicketTypes(event.slug, eventPreviewToken(event.id))).length, 1);
});

test("statistiques : impossible d'attribuer un événement à une organisation, métadonnées bornées", async () => {
  const { AnalyticsService } = await import("./analytics/analytics.service");
  const analytics = new AnalyticsService(prismaService);
  const { tenant } = await seed();
  assert.deepEqual(await analytics.track({ name: "purchase", sessionId: "session-0001", tenantId: tenant.id, userId: "u", metadata: { step: 2 } }), { ok: true });
  const row = await prisma.productEvent.findFirstOrThrow();
  assert.equal(row.tenantId, null);
  assert.equal(row.userId, null);
  await assert.rejects(analytics.track({ name: "x", sessionId: "session-0001", metadata: { junk: "x".repeat(5_000) } }));
  await assert.rejects(analytics.track({ name: "x", sessionId: "session-0001", metadata: { nested: { a: 1 } } }));
  await assert.rejects(analytics.track({ name: "<script>", sessionId: "session-0001" }));
});

test("invitation acceptée deux fois en même temps : un seul compte, l'autre clic reçoit un refus clair", async () => {
  const { createHash } = await import("crypto");
  const { tenant } = await seed();
  const token = "t".repeat(64);
  await prisma.invitation.create({
    data: { tenantId: tenant.id, email: "invite@audit.io", role: UserRole.ORGANIZER_STAFF, tokenHash: createHash("sha256").update(token).digest("hex"), status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000), invitedByUserId: "owner" }
  });
  const results = await Promise.allSettled([auth.acceptInvitation({ token, password: "Password123!" }), auth.acceptInvitation({ token, password: "Password123!" })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.match((refused.reason as Error).message, /déjà été utilisée|Invitation invalide/);
  assert.equal(await prisma.user.count({ where: { email: "invite@audit.io" } }), 1);
});

test("purge : les verrous de connexion expirés et anciens sont effacés, un verrou en cours est gardé", async () => {
  const { tenant } = await seed();
  const old = new Date(Date.now() - 60 * 24 * 3600_000);
  await prisma.loginAttempt.createMany({
    data: [
      { identifier: "a:expired@x.io", count: 6, lockedUntil: new Date(Date.now() - 3600_000), updatedAt: old },
      { identifier: "a:active@x.io", count: 6, lockedUntil: new Date(Date.now() + 3600_000), updatedAt: old },
      { identifier: "a:plain@x.io", count: 2, lockedUntil: null, updatedAt: old }
    ]
  });
  await maintenance.purge({ userId: "pa", tenantId: tenant.id, role: UserRole.PLATFORM_ADMIN, email: "pa@x.io" }, {});
  const left = (await prisma.loginAttempt.findMany({ select: { identifier: true } })).map((r) => r.identifier);
  assert.deepEqual(left, ["a:active@x.io"]);
});
