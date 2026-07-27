import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  EventStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";
import { PlatformSecretsService } from "../platform-control/platform-secrets.service";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";
import { PaymentVerifyService } from "./payment-verify.service";
import type {
  FeexpayInitRequest,
  FeexpayInitResult,
  FeexpayStatusPayload
} from "./feexpay/feexpay.types";
import { FeexpayGateway } from "./psp/feexpay.gateway";
import { parseStrictProviderAmount } from "./psp/parse-provider-amount";
import { FedapayGateway } from "./psp/fedapay.gateway";
import { KkiapayGateway } from "./psp/kkiapay.gateway";
import { PspRegistry } from "./psp/psp.registry";
import type { PspCredentials } from "./psp/psp.types";

/**
 * These tests verify the SECURITY-CRITICAL invariant of the platform:
 *
 *   "No vote enters the tally unless Feexpay confirmed (server-to-server)
 *    a transaction with the SAME reference, SAME amount, SAME currency, with
 *    status SUCCESSFUL."
 *
 * Every test below is structured as an attack scenario: what would happen if
 * an attacker (or a bug) tried to confirm a vote without real money behind it?
 * The verify service MUST refuse and audit.
 */

class FakeFeexpay {
  // Allows tests to script the next response, or to throw a transient error.
  next: { kind: "ok"; payload: FeexpayStatusPayload } | { kind: "throw"; err: Error } = {
    kind: "ok",
    payload: { status: "PENDING", amount: 0, currency: "XOF" }
  };
  initCalls: FeexpayInitRequest[] = [];
  fetchCalls: string[] = [];

  async initRequestToPay(req: FeexpayInitRequest): Promise<FeexpayInitResult> {
    this.initCalls.push(req);
    return {
      reference: `fp_${this.initCalls.length}`,
      status: "PENDING",
      amount: req.amountCfa
    };
  }

  async fetchStatus(reference: string): Promise<FeexpayStatusPayload> {
    this.fetchCalls.push(reference);
    if (this.next.kind === "throw") throw this.next.err;
    return this.next.payload;
  }
}

class FakeFeexpayGateway extends FeexpayGateway {
  constructor(private readonly fake: FakeFeexpay) {
    super();
  }

  async fetchPayinStatus(reference: string, _creds: PspCredentials): Promise<import("./psp/psp.types").PspStatusResult> {
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

const prismaService = new PrismaService();
const fake = new FakeFeexpay();
const secrets = new OrganizerSecretsService(prismaService);
const platformSecrets = new PlatformSecretsService(prismaService);
const pspRegistry = new PspRegistry(
  prismaService,
  secrets,
  platformSecrets,
  new FakeFeexpayGateway(fake),
  new FedapayGateway(),
  new KkiapayGateway()
);
const verify = new PaymentVerifyService(
  prismaService,
  new NotificationsService(prismaService),
  pspRegistry
);

before(() => assertTestDatabase());
beforeEach(async () => {
  await resetDatabase();
  fake.next = { kind: "ok", payload: { status: "PENDING", amount: 0, currency: "XOF" } };
  fake.initCalls = [];
  fake.fetchCalls = [];
});
after(() => prisma.$disconnect());

async function seedPendingVotePayment(opts: {
  amountCfa?: number;
  currency?: string;
  providerRef?: string;
  withVote?: boolean;
  purpose?: PaymentPurpose;
} = {}) {
  const amountCfa = opts.amountCfa ?? 500;
  const tenant = await prisma.tenant.create({
    data: { slug: "vfy-org", displayName: "Verify Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "vfy-evt",
      title: "Verify Evt",
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: candidateTestData(event.id, { fullName: "Cand 1", number: 1 })
  });
  const vote = opts.withVote === false
    ? null
    : await prisma.vote.create({
        data: {
          tenantId: tenant.id,
          eventId: event.id,
          candidateId: candidate.id,
          amountCfa
        }
      });
  const tx = await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote?.id ?? null,
      provider: PaymentProvider.FEEXPAY,
      providerRef: opts.providerRef ?? `fp_ref_${Date.now()}`,
      amountCfa,
      currency: opts.currency ?? "XOF",
      status: PaymentStatus.PENDING,
      purpose: opts.purpose ?? PaymentPurpose.VOTE,
      idempotencyKey: `idem_${Math.random().toString(36).slice(2)}_aaaaaaaaaaaaaaaaaa`
    }
  });
  return { tenant, event, candidate, vote, tx };
}

// ---------------------------------------------------------------------------
// 🟢 Happy path
// ---------------------------------------------------------------------------

test("pull SUCCESSFUL avec montant et devise corrects → vote.paidAt posé + tx SUCCEEDED + audit", async () => {
  const { tx, vote } = await seedPendingVotePayment({ amountCfa: 500, providerRef: "fp_ok_1" });
  fake.next = {
    kind: "ok",
    payload: { status: "SUCCESSFUL", amount: "500", currency: "XOF" }
  };

  const result = await verify.verifyAndApplyByReference("fp_ok_1");

  assert.equal(result.outcome, "applied");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.SUCCEEDED);
  const updatedVote = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.ok(updatedVote?.paidAt, "vote.paidAt doit être posé");
  const audits = await prisma.auditLog.findMany({
    where: { action: "payment.verified_applied", targetId: tx.id }
  });
  assert.equal(audits.length, 1);
});

// ---------------------------------------------------------------------------
// 🔴 Attaques montant — la garantie principale demandée par l'utilisateur
// ---------------------------------------------------------------------------

test("ATTAQUE: pull SUCCESSFUL mais montant Feexpay < tx → REJET, vote.paidAt null, audit amount_mismatch", async () => {
  const { tx, vote } = await seedPendingVotePayment({ amountCfa: 10_000, providerRef: "fp_under" });
  fake.next = {
    // Feexpay confirme un paiement de 100 FCFA, mais le vote en demande 10 000.
    kind: "ok",
    payload: { status: "SUCCESSFUL", amount: "100", currency: "XOF" }
  };

  const result = await verify.verifyAndApplyByReference("fp_under");

  assert.equal(result.outcome, "rejected");
  assert.equal(result.reason, "amount_mismatch");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING, "tx reste PENDING");
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null, "vote NE doit PAS être compté");
  const audits = await prisma.auditLog.findMany({
    where: { action: "payment.verify_rejected", targetId: tx.id }
  });
  assert.equal(audits.length, 1);
  const first = audits[0];
  assert.ok(first);
  assert.equal((first.metadata as { reason: string }).reason, "amount_mismatch");
});

test("ATTAQUE: montant amount renvoyé sous forme '500abc' non parsable → REJET amount_unparseable", async () => {
  const { tx, vote } = await seedPendingVotePayment({ amountCfa: 500, providerRef: "fp_bad" });
  fake.next = { kind: "ok", payload: { status: "SUCCESSFUL", amount: "500abc", currency: "XOF" } };

  const result = await verify.verifyAndApplyByReference("fp_bad");

  assert.equal(result.outcome, "rejected");
  assert.equal(result.reason, "amount_unparseable");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING);
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null);
});

test("ATTAQUE: devise différente (USD au lieu de XOF) → REJET currency_mismatch", async () => {
  const { tx, vote } = await seedPendingVotePayment({ amountCfa: 500, providerRef: "fp_usd" });
  fake.next = { kind: "ok", payload: { status: "SUCCESSFUL", amount: "500", currency: "USD" } };

  const result = await verify.verifyAndApplyByReference("fp_usd");

  assert.equal(result.outcome, "rejected");
  assert.equal(result.reason, "currency_mismatch");
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null);
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING);
});

// ---------------------------------------------------------------------------
// 🔴 Anti-rejeu / anti-flip
// ---------------------------------------------------------------------------

test("ATTAQUE: webhook rejoué sur une tx VOIDED (annulée par PLATFORM_ADMIN) → ignored_terminal, vote inchangé", async () => {
  const { tx, vote } = await seedPendingVotePayment({ amountCfa: 500, providerRef: "fp_voided" });
  await prisma.paymentTransaction.update({
    where: { id: tx.id },
    data: { status: PaymentStatus.VOIDED }
  });
  fake.next = { kind: "ok", payload: { status: "SUCCESSFUL", amount: "500", currency: "XOF" } };

  const result = await verify.verifyAndApplyByReference("fp_voided");

  assert.equal(result.outcome, "ignored_terminal");
  assert.equal(result.reason, PaymentStatus.VOIDED);
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.VOIDED, "tx ne doit PAS être flipée VOIDED → SUCCEEDED");
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null);
});

test("ATTAQUE: webhook reçu pour une reference inconnue → rejected unknown_reference, aucun side-effect, AUCUN audit DB (pas de tenant à charger)", async () => {
  const result = await verify.verifyAndApplyByReference("fp_does_not_exist");
  assert.equal(result.outcome, "rejected");
  assert.equal(result.reason, "unknown_reference");
  // Pas d'audit DB pour une référence orpheline : AuditLog.tenantId est une FK
  // et un attaquant qui sonde des refs aléatoires ne doit pas pouvoir polluer
  // la table. La trace passe par le logger structuré.
  const audits = await prisma.auditLog.findMany({ where: { action: "payment.verify_rejected" } });
  assert.equal(audits.length, 0);
  // Mais aucune mutation non plus :
  const txs = await prisma.paymentTransaction.findMany();
  assert.equal(txs.length, 0);
  const votes = await prisma.vote.findMany();
  assert.equal(votes.length, 0);
});

test("idempotence: re-pull successif sur une tx déjà SUCCEEDED → ignored_terminal, pas de double commission ni de double audit", async () => {
  const { tx, vote } = await seedPendingVotePayment({ amountCfa: 500, providerRef: "fp_idem" });
  fake.next = { kind: "ok", payload: { status: "SUCCESSFUL", amount: "500", currency: "XOF" } };

  const first = await verify.verifyAndApplyByReference("fp_idem");
  assert.equal(first.outcome, "applied");

  const second = await verify.verifyAndApplyByReference("fp_idem");
  assert.equal(second.outcome, "ignored_terminal");

  const audits = await prisma.auditLog.findMany({ where: { targetId: tx.id, action: "payment.verified_applied" } });
  assert.equal(audits.length, 1, "audit n'est écrit qu'une fois");
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.ok(v?.paidAt);
});

// ---------------------------------------------------------------------------
// 🟡 Statuts non terminaux
// ---------------------------------------------------------------------------

test("pull PENDING → outcome still_pending, tx PENDING, vote.paidAt null", async () => {
  const { tx, vote } = await seedPendingVotePayment({ providerRef: "fp_pend" });
  fake.next = { kind: "ok", payload: { status: "PENDING", amount: "500", currency: "XOF" } };

  const result = await verify.verifyAndApplyByReference("fp_pend");
  assert.equal(result.outcome, "still_pending");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING);
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null);
});

test("pull FAILED → tx FAILED + audit payment.verified_failed, vote PAS compté", async () => {
  const { tx, vote } = await seedPendingVotePayment({ providerRef: "fp_failed" });
  fake.next = {
    kind: "ok",
    payload: { status: "FAILED", amount: "500", currency: "XOF", reason: "LOW_BALANCE" }
  };

  const result = await verify.verifyAndApplyByReference("fp_failed");
  assert.equal(result.outcome, "failed");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.FAILED);
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null);
  const audits = await prisma.auditLog.findMany({
    where: { action: "payment.verified_failed", targetId: tx.id }
  });
  assert.equal(audits.length, 1);
});

test("Feexpay indisponible (throw) → still_pending, aucune mutation, tx reste PENDING pour cron", async () => {
  const { tx, vote } = await seedPendingVotePayment({ providerRef: "fp_down" });
  fake.next = { kind: "throw", err: new Error("ECONNRESET") };

  const result = await verify.verifyAndApplyByReference("fp_down");
  assert.equal(result.outcome, "still_pending");
  assert.equal(result.reason, "pull_failed");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING);
  const v = await prisma.vote.findUnique({ where: { id: vote!.id } });
  assert.equal(v?.paidAt, null);
});

// ---------------------------------------------------------------------------
// 🟢 Activation forfait
// ---------------------------------------------------------------------------

test("ACTIVATION SUCCESSFUL → event.activationPaidAt posé, pas de vote ni de commission", async () => {
  const { tx, event } = await seedPendingVotePayment({
    amountCfa: 30_000,
    providerRef: "fp_activ",
    purpose: PaymentPurpose.ACTIVATION,
    withVote: false
  });
  // Pour ACTIVATION, voteId est null — on le confirme.
  await prisma.paymentTransaction.update({ where: { id: tx.id }, data: { voteId: null } });
  fake.next = { kind: "ok", payload: { status: "SUCCESSFUL", amount: "30000", currency: "XOF" } };

  const result = await verify.verifyAndApplyByReference("fp_activ");
  assert.equal(result.outcome, "applied");
  const after = await prisma.event.findUnique({ where: { id: event.id } });
  assert.ok(after?.activationPaidAt, "activation doit être déverrouillée");
  const txAfter = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(txAfter?.commissionCfa, null, "pas de commission sur une ACTIVATION");
});
