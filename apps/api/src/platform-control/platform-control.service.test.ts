import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus, UserRole } from "@prisma/client";
import { PlatformControlService } from "./platform-control.service";
import { VaultService } from "./vault.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

// Real-database tests. No mock Prisma. After Phase 1, cancelVote/deleteVote
// purge the live Vote + PaymentTransaction rows and deposit an encrypted
// snapshot in VaultEntry (the "Option B+" forensic vault).
const prismaService = new PrismaService();
const vault = new VaultService(prismaService);
const service = new PlatformControlService(prismaService, vault);

const admin = {
  userId: "platform-admin-1",
  tenantId: "",
  email: "admin@votezpro.africa",
  role: UserRole.PLATFORM_ADMIN
};

before(() => {
  assertTestDatabase();
});
beforeEach(async () => {
  await resetDatabase();
});
after(async () => {
  await prisma.$disconnect();
});

async function seed() {
  const tenant = await prisma.tenant.create({ data: { slug: "campus-africa", displayName: "Campus Africa" } });
  admin.tenantId = tenant.id;
  const now = new Date();
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "miss-campus-2026",
      title: "Miss Campus 2026",
      status: EventStatus.ACTIVE,
      startsAt: new Date(now.getTime() - 86_400_000),
      endsAt: new Date(now.getTime() + 86_400_000)
    }
  });
  const candidate = await prisma.candidate.create({
    data: candidateTestData(event.id, { fullName: "Arielle Dossou", number: 7 })
  });
  const vote = await prisma.vote.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 1000,
      voterPhoneHash: "hash",
      voterPhoneLast4: "1122",
      paidAt: new Date()
    }
  });
  const payment = await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      voteId: vote.id,
      provider: PaymentProvider.FEEXPAY,
      providerRef: "fp_pc_seed_1",
      amountCfa: 1000,
      status: PaymentStatus.SUCCEEDED,
      purpose: PaymentPurpose.VOTE,
      commissionCfa: 100,
      idempotencyKey: "platform-test-idem-0001"
    }
  });
  return { tenant, event, candidate, vote, payment };
}

test("commission: réglage global, override par évènement et résolution", async () => {
  const { event } = await seed();

  await service.updateCommission(admin, { commissionBps: 1000 }); // 10%
  assert.equal((await service.getSettings()).commissionBps, 1000);

  await service.setEventCommission(admin, event.id, { commissionBps: 500 }); // 5%
  assert.equal(await service.resolveCommissionBps(500), 500); // override évènement
  assert.equal(await service.resolveCommissionBps(null), 1000); // défaut plateforme
});

test("cancelVote: PURGE le vote et le paiement du ledger, dépose dans le vault", async () => {
  const { tenant, event, vote, payment } = await seed();

  const result = await service.cancelVote(admin, vote.id, { reason: "Fraude détectée" });
  assert.equal(result.cancelled, true);
  assert.equal(result.paymentVoided, true);

  // Vote physiquement parti du ledger principal
  const remainingVote = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(remainingVote, null);
  // Paiement physiquement parti
  const remainingPayment = await prisma.paymentTransaction.findUnique({ where: { id: payment.id } });
  assert.equal(remainingPayment, null);

  // Trace dans le coffre, chiffrée
  const ventry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.equal(ventry.kind, "vote_cancelled");
  assert.equal(ventry.tenantId, tenant.id);
  assert.equal(ventry.eventId, event.id);
  assert.equal(ventry.amountCfa, 1000);
  // Le providerRef et la raison ne fuitent pas en clair
  assert.ok(!ventry.cipherText.includes("fp_pc_seed_1"));
  assert.ok(!ventry.cipherText.includes("Fraude"));

  // Annuler 2x : NotFoundException (le vote n'existe plus)
  await assert.rejects(service.cancelVote(admin, vote.id, { reason: "encore" }), /introuvable/);
});

test("deleteVote: PURGE + coffre avec kind=vote_deleted", async () => {
  const { vote } = await seed();
  const result = await service.deleteVote(admin, vote.id);
  assert.equal(result.deleted, true);
  const remainingVote = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(remainingVote, null);
  const ventry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.equal(ventry.kind, "vote_deleted");
});

test("overview: après annulation, votes/revenu disparaissent ; confiscation visible", async () => {
  const { vote } = await seed();

  const before = await service.getOverview();
  assert.equal(before.votes.active, 1);
  assert.equal(before.grossRevenueCfa, 1000);
  assert.equal(before.commissionCfa, 100);

  await service.cancelVote(admin, vote.id, { reason: "test" });

  const after = await service.getOverview();
  // Vote purgé du ledger principal : 0 partout
  assert.equal(after.votes.active, 0);
  assert.equal(after.votes.cancelled, 0, "cancelledVotes=0 puisque la ligne n'existe plus dans Vote");
  assert.equal(after.grossRevenueCfa, 0);
  assert.equal(after.commissionCfa, 0);
  // Mais la confiscation est tracée (revenu plateforme caché)
  assert.equal(after.confiscatedRevenueCfa, 1000);
});
