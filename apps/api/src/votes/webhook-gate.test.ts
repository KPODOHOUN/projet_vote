import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VotesService } from "./votes.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

// Verrouille la règle d'or de la plateforme : AUCUN vote ne doit jamais
// apparaître dans les résultats publics tant que le webhook FeexPay n'a pas
// posé `paidAt`. Même un PaymentTransaction SUCCEEDED mais sans paidAt sur
// la ligne Vote ne doit PAS être compté.
const prismaService = new PrismaService();
const votes = new VotesService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedEventWithCandidate() {
  const tenant = await prisma.tenant.create({
    data: { slug: "gate-org", displayName: "Gate Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "gate-event",
      title: "Gate event",
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: candidateTestData(event.id, { fullName: "Cand A", number: 1 })
  });
  return { tenant, event, candidate };
}

test("vote sans paidAt : 0 dans le tally", async () => {
  const { tenant, event, candidate } = await seedEventWithCandidate();
  await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500
    }
  });
  const results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 0);
  assert.equal(results.totals.amountCfa, 0);
});

test("vote avec paidAt : compté ; vote dont SEUL PaymentTransaction est SUCCEEDED mais paidAt null : PAS compté", async () => {
  const { tenant, event, candidate } = await seedEventWithCandidate();

  // Vote A : webhook a bien posé paidAt → doit compter
  await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });

  // Vote B : paiement SUCCEEDED mais paidAt n'a pas été stampé (bug
  // hypothétique, désync, etc.) → NE doit PAS compter, la source de vérité
  // est `Vote.paidAt`, jamais la jointure.
  const voteB = await prisma.vote.create({
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
      voteId: voteB.id,
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      idempotencyKey: "no-paidat-test-key-1234567"
    }
  });

  const results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 1, "seul Vote A doit compter");
  assert.equal(results.totals.amountCfa, 500);

  const rA = results.results.find((r) => r.candidateId === candidate.id);
  assert.equal(rA?.voteCount, 1);
});

test("vote avec paidAt mais cancelledAt non null : PAS compté", async () => {
  const { tenant, event, candidate } = await seedEventWithCandidate();
  await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date(),
      cancelledAt: new Date(),
      cancelledReason: "test"
    }
  });
  const results = await votes.computeResults(event.id);
  assert.equal(results.totals.votes, 0);
});
