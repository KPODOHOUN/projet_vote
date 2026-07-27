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
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import type { FeexpayStatusPayload } from "./feexpay/feexpay.types";
import { FeexpayGateway } from "./psp/feexpay.gateway";
import { parseStrictProviderAmount } from "./psp/parse-provider-amount";
import { FedapayGateway } from "./psp/fedapay.gateway";
import { KkiapayGateway } from "./psp/kkiapay.gateway";
import { PspRegistry } from "./psp/psp.registry";
import type { PspCredentials } from "./psp/psp.types";

/**
 * Reconciliation is the ADR-017 safety net: it must recover a paid-but-never-
 * -poked transaction (lost webhook) and expire an orphan that can never resolve,
 * all while delegating every confirmation to the authoritative verify pipeline.
 */

class FakeFeexpay {
  scripted = new Map<string, FeexpayStatusPayload>();
  fetchCalls: string[] = [];
  async fetchStatus(reference: string): Promise<FeexpayStatusPayload> {
    this.fetchCalls.push(reference);
    return this.scripted.get(reference) ?? { status: "PENDING", amount: 0, currency: "XOF" };
  }
}

class FakeFeexpayGateway extends FeexpayGateway {
  constructor(private readonly fake: FakeFeexpay) {
    super();
  }
  async fetchPayinStatus(reference: string, _creds: PspCredentials) {
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
const reconciliation = new PaymentReconciliationService(prismaService, verify);

before(() => assertTestDatabase());
beforeEach(async () => {
  await resetDatabase();
  fake.scripted.clear();
  fake.fetchCalls = [];
});
after(() => prisma.$disconnect());

/** Seeds a PENDING vote tx whose createdAt is forced into the past. */
async function seedStalePending(opts: {
  providerRef?: string | null;
  ageMinutes: number;
  amountCfa?: number;
}) {
  const amountCfa = opts.amountCfa ?? 500;
  const tenant = await prisma.tenant.create({
    data: { slug: `rec-org-${Math.random().toString(36).slice(2, 8)}`, displayName: "Rec Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: `rec-evt-${Math.random().toString(36).slice(2, 8)}`,
      title: "Rec Evt",
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: candidateTestData(event.id, { fullName: "Cand 1", number: 1 })
  });
  const vote = await prisma.vote.create({
    data: { tenantId: tenant.id, eventId: event.id, candidateId: candidate.id, amountCfa }
  });
  const createdAt = new Date(Date.now() - opts.ageMinutes * 60_000);
  const tx = await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      providerRef: opts.providerRef === null ? null : (opts.providerRef ?? `fp_${Math.random().toString(36).slice(2)}`),
      amountCfa,
      currency: "XOF",
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: `idem_${Math.random().toString(36).slice(2)}_aaaaaaaaaaaaaaaaaa`,
      createdAt
    }
  });
  return { tenant, event, vote, tx };
}

// ---------------------------------------------------------------------------
// 🟢 Lost-webhook recovery
// ---------------------------------------------------------------------------

test("lost webhook: PENDING avec providerRef réellement payé → réconcilié en SUCCEEDED + vote.paidAt", async () => {
  const { tx, vote } = await seedStalePending({ providerRef: "fp_lost_1", ageMinutes: 10 });
  fake.scripted.set("fp_lost_1", { status: "SUCCESSFUL", amount: "500", currency: "XOF" });

  const summary = await reconciliation.reconcilePending();

  assert.equal(summary.applied, 1);
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.SUCCEEDED);
  const v = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.ok(v?.paidAt, "vote.paidAt doit être posé après réconciliation");
});

test("grace window: PENDING trop récent n'est pas encore repull", async () => {
  await seedStalePending({ providerRef: "fp_fresh", ageMinutes: 1 });
  fake.scripted.set("fp_fresh", { status: "SUCCESSFUL", amount: "500", currency: "XOF" });

  const summary = await reconciliation.reconcilePending({ pullAfterMinutes: 3 });

  assert.equal(summary.scanned, 0, "tx sous la fenêtre de grâce est ignorée");
  assert.equal(fake.fetchCalls.length, 0, "aucun pull PSP pour une tx trop récente");
});

test("toujours en attente côté PSP → reste PENDING, aucune mutation", async () => {
  const { tx } = await seedStalePending({ providerRef: "fp_still", ageMinutes: 10 });
  fake.scripted.set("fp_still", { status: "PENDING", amount: "500", currency: "XOF" });

  const summary = await reconciliation.reconcilePending();

  assert.equal(summary.stillPending, 1);
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING);
});

// ---------------------------------------------------------------------------
// 🔴 Orphan expiry (no providerRef, can never resolve)
// ---------------------------------------------------------------------------

test("orphelin: PENDING sans providerRef, vieux → FAILED + audit, jamais compté", async () => {
  const { tx, vote } = await seedStalePending({ providerRef: null, ageMinutes: 120 });

  const summary = await reconciliation.reconcilePending({ expireAfterMinutes: 60 });

  assert.equal(summary.expired, 1);
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.FAILED);
  const v = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(v?.paidAt, null, "un orphelin expiré ne doit jamais compter");
  const audits = await prisma.auditLog.findMany({
    where: { action: "payment.expired_orphan", targetId: tx.id }
  });
  assert.equal(audits.length, 1);
});

test("orphelin récent (sous le délai d'expiration) → laissé PENDING pour un tick ultérieur", async () => {
  const { tx } = await seedStalePending({ providerRef: null, ageMinutes: 10 });

  const summary = await reconciliation.reconcilePending({ expireAfterMinutes: 60 });

  assert.equal(summary.expired, 0);
  assert.equal(summary.skipped, 1);
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.PENDING);
});

// ---------------------------------------------------------------------------
// 🟢 Idempotence / sûreté
// ---------------------------------------------------------------------------

test("ré-exécution: une tx déjà SUCCEEDED n'est pas retraitée", async () => {
  const { tx } = await seedStalePending({ providerRef: "fp_twice", ageMinutes: 10 });
  fake.scripted.set("fp_twice", { status: "SUCCESSFUL", amount: "500", currency: "XOF" });

  await reconciliation.reconcilePending();
  const firstCalls = fake.fetchCalls.length;
  const summary2 = await reconciliation.reconcilePending();

  assert.equal(summary2.scanned, 0, "une tx terminale n'est plus scannée (filtre PENDING)");
  assert.equal(fake.fetchCalls.length, firstCalls, "aucun pull supplémentaire");
  const after = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  assert.equal(after?.status, PaymentStatus.SUCCEEDED);
});
