import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "./vault.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

const prismaService = new PrismaService();
const vault = new VaultService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

const superAdmin = {
  userId: "super-1",
  tenantId: "n/a",
  role: UserRole.PLATFORM_SUPER_ADMIN,
  email: "super@votez.pro"
};

async function seed() {
  const tenant = await prisma.tenant.create({ data: { slug: "v-org", displayName: "V" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "v-evt",
      title: "v",
      status: EventStatus.ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: candidateTestData(event.id, { fullName: "A", number: 1 })
  });
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });
  const payment = await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      providerRef: "fp_v_1",
      amountCfa: 500,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 50,
      idempotencyKey: "vault-test-key-12345678"
    }
  });
  return { tenant, event, vote, payment };
}

test("createEntry : écrit une ligne chiffrée et n'expose pas le providerRef en clair", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_cancelled",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment, reason: "fraude" } as never
  });
  const row = await prisma.vaultEntry.findFirst({ where: { originalVoteId: vote.id } });
  assert.ok(row);
  assert.equal(row?.kind, "vote_cancelled");
  assert.equal(row?.amountCfa, 500);
  assert.ok((row?.cipherText.length ?? 0) > 0);
  // Le providerRef doit être chiffré, donc absent en clair
  assert.ok(!row?.cipherText.includes("fp_v_1"));
});

test("listEntries : retourne les métadonnées sans déchiffrer", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_deleted",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment } as never
  });
  const list = await vault.listEntries({ limit: 10 });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0]?.kind, "vote_deleted");
  assert.equal(list.items[0]?.amountCfa, 500);
  assert.ok(!("cipherText" in (list.items[0] ?? {})));
});

test("revealEntry : restitue le snapshot original", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_cancelled",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment, reason: "fraude détectée" } as never
  });
  const entry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  const revealed = await vault.revealEntry(entry.id);
  const snap = revealed.snapshot as { reason: string; vote: { id: string }; payment: { providerRef: string } };
  assert.equal(snap.reason, "fraude détectée");
  assert.equal(snap.vote.id, vote.id);
  assert.equal(snap.payment.providerRef, "fp_v_1");
});

test("createEntry est idempotent par (originalVoteId, kind)", async () => {
  const { tenant, event, vote, payment } = await seed();
  await vault.createEntry({
    kind: "vote_cancelled",
    tenantId: tenant.id,
    eventId: event.id,
    originalVoteId: vote.id,
    amountCfa: vote.amountCfa,
    occurredAt: new Date(),
    actorUserId: superAdmin.userId,
    snapshot: { vote, payment } as never
  });
  await assert.rejects(
    vault.createEntry({
      kind: "vote_cancelled",
      tenantId: tenant.id,
      eventId: event.id,
      originalVoteId: vote.id,
      amountCfa: vote.amountCfa,
      occurredAt: new Date(),
      actorUserId: superAdmin.userId,
      snapshot: { vote, payment } as never
    }),
    /déjà coffré/
  );
});
