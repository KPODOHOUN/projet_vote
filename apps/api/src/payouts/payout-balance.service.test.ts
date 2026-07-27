import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutBalanceService } from "./payout-balance.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

const prismaService = new PrismaService();
const service = new PayoutBalanceService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedRevenue() {
  const tenant = await prisma.tenant.create({ data: { slug: "pb-org", displayName: "PB" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "pb-evt",
      title: "PB",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const c = await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "A", number: 1 }) });
  const v = await prisma.vote.create({
    data: { tenantId: tenant.id, eventId: event.id, candidateId: c.id, amountCfa: 1000, paidAt: new Date() }
  });
  // Vote SUCCEEDED 1000, commission 100 → net 900
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: v.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 1000,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 100,
      idempotencyKey: "pb-vote-key-12345678"
    }
  });
  // Activation 25000 SUCCEEDED (platform revenue)
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 25000,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.ACTIVATION,
      idempotencyKey: "pb-act-key-12345678"
    }
  });
  return { tenant, event };
}

const windowAround = () => ({ from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) });

test("computeOrganizerBalance: net = brut − commission, borné à la fenêtre", async () => {
  const { tenant } = await seedRevenue();
  const r = await service.computeOrganizerBalance(tenant.id, windowAround());
  assert.equal(r.grossCfa, 1000);
  assert.equal(r.commissionCfa, 100);
  assert.equal(r.netCfa, 900);
  assert.equal(r.lines.length, 1);
});

test("computeOrganizerBalance: exclut les paiements déjà pinés à une PayoutLine", async () => {
  const { tenant } = await seedRevenue();
  const pay = await prisma.paymentTransaction.findFirstOrThrow({ where: { purpose: PaymentPurpose.VOTE } });
  const period = await prisma.payoutPeriod.create({
    data: { label: "w-pinned", from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) }
  });
  const payout = await prisma.payout.create({
    data: {
      periodId: period.id,
      kind: "ORGANIZER",
      beneficiaryTenantId: tenant.id,
      amountCfa: 900,
      idempotencyKey: "pinned-key",
      provider: PaymentProvider.FEEXPAY,
      status: "SUCCEEDED"
    }
  });
  await prisma.payoutLine.create({
    data: { payoutId: payout.id, paymentTransactionId: pay.id, amountCfa: 900, kind: "vote_net" }
  });
  const r = await service.computeOrganizerBalance(tenant.id, windowAround());
  assert.equal(r.netCfa, 0, "le paiement déjà versé ne doit pas être recompté");
  assert.equal(r.lines.length, 0);
});

test("computePlatformBalance: commissions + activations + confiscations", async () => {
  const { tenant, event } = await seedRevenue();
  await prisma.vaultEntry.create({
    data: {
      kind: "vote_cancelled",
      tenantId: tenant.id,
      eventId: event.id,
      originalVoteId: "ov-1",
      amountCfa: 500,
      occurredAt: new Date(),
      cipherText: "x",
      iv: "x",
      authTag: "x"
    }
  });
  const r = await service.computePlatformBalance(windowAround());
  assert.equal(r.commissionCfa, 100);
  assert.equal(r.activationFeesCfa, 25000);
  assert.equal(r.confiscatedCfa, 500);
  assert.equal(r.totalCfa, 25600);
});

test("listTenantsWithBalance: renvoie les tenants avec ≥1 vote SUCCEEDED non piné dans la fenêtre", async () => {
  const { tenant } = await seedRevenue();
  const ids = await service.listTenantsWithBalance(windowAround());
  assert.deepEqual(ids, [tenant.id]);
});
