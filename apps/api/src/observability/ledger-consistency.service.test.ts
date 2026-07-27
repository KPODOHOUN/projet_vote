import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerConsistencyService } from "./ledger-consistency.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

const prismaService = new PrismaService();
const ledger = new LedgerConsistencyService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function baseEvent() {
  const tenant = await prisma.tenant.create({ data: { slug: "led-org", displayName: "Led" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "led-evt",
      title: "led",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: candidateTestData(event.id, { fullName: "A", number: 1 })
  });
  return { tenant, event, candidate };
}

test("base saine : 0 incohérence", async () => {
  const { tenant, event, candidate } = await baseEvent();
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 50,
      idempotencyKey: "consistent-key-12345678"
    }
  });
  const report = await ledger.scan();
  assert.equal(report.votesPaidWithoutSucceededPayment.length, 0);
  assert.equal(report.succeededPaymentsWithoutPaidVote.length, 0);
});

test("incohérence : Vote.paidAt posé mais PaymentTransaction n'est pas SUCCEEDED", async () => {
  const { tenant, event, candidate } = await baseEvent();
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 500,
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "inconsistent-key-1234567"
    }
  });
  const report = await ledger.scan();
  assert.equal(report.votesPaidWithoutSucceededPayment.length, 1);
  assert.equal(report.votesPaidWithoutSucceededPayment[0]?.voteId, vote.id);
});

test("incohérence : PaymentTransaction SUCCEEDED VOTE mais Vote.paidAt null", async () => {
  const { tenant, event, candidate } = await baseEvent();
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "missing-paidat-key-12345"
    }
  });
  const report = await ledger.scan();
  assert.equal(report.succeededPaymentsWithoutPaidVote.length, 1);
  assert.equal(report.succeededPaymentsWithoutPaidVote[0]?.voteId, vote.id);
});
