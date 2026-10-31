import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, PaymentPurpose, PaymentStatus, UserRole } from "@prisma/client";
import { PlatformControlService } from "./platform-control.service";
import { VaultService } from "./vault.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";
import { WalletService } from "../offers/wallet.service";

// Real-database tests. No mock Prisma. After Phase 1, cancelVote/deleteVote
// purge the live Vote + PaymentTransaction rows and deposit an encrypted
// snapshot in VaultEntry (the "Option B+" forensic vault).
const prismaService = new PrismaService();
const vault = new VaultService(prismaService);
const service = new PlatformControlService(prismaService, vault, new WalletService(prismaService));

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

const superAdmin = () => ({ ...admin, role: UserRole.PLATFORM_SUPER_ADMIN });

test("annulation d'un vote payé : réservée au super-admin, tracée, paiement VOIDED conservé, portefeuille repris", async () => {
  const { tenant, event, vote, payment } = await seed();
  // Ce que le paiement avait crédité à l'organisateur (net 900 : 450 réserve, 450 disponible).
  await new WalletService(prismaService).creditSplit({ tenantId: tenant.id, netCfa: 900, heldBps: 5000, kind: "VOTE_CREDIT", eventId: event.id, paymentId: payment.id });

  await assert.rejects(service.cancelVote(admin, vote.id, { reason: "Fraude détectée" }), /super-administrateur/);
  const result = await service.cancelVote(superAdmin(), vote.id, { reason: "Fraude détectée" });
  assert.equal(result.cancelled, true);
  assert.equal(result.reversedFromOrganizerCfa, 900);

  const kept = await prisma.vote.findUniqueOrThrow({ where: { id: vote.id } });
  assert.ok(kept.cancelledAt);
  assert.equal(kept.cancelledReason, "Fraude détectée");
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: payment.id } })).status, PaymentStatus.VOIDED);
  const wallet = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(wallet.withdrawableCfa + wallet.heldCfa, 0);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "vote.cancelled", targetId: vote.id } });
  assert.equal((audit.metadata as { refundDueToVoterCfa: number }).refundDueToVoterCfa, 1000);
  // Copie chiffrée gardée dans le coffre.
  const ventry = await prisma.vaultEntry.findFirstOrThrow({ where: { originalVoteId: vote.id } });
  assert.ok(!ventry.cipherText.includes("Fraude"));

  await assert.rejects(service.cancelVote(superAdmin(), vote.id, { reason: "encore" }), /déjà annulé/);
});

test("annulation refusée si l'organisateur a déjà retiré l'argent du vote", async () => {
  const { tenant, event, vote, payment } = await seed();
  const wallet = new WalletService(prismaService);
  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 900, heldBps: 0, kind: "VOTE_CREDIT", eventId: event.id, paymentId: payment.id });
  await wallet.debit({ tenantId: tenant.id, amountCfa: 900, kind: "WITHDRAWAL_DEBIT", from: "withdrawable" });
  await assert.rejects(service.cancelVote(superAdmin(), vote.id, { reason: "Fraude" }), /déjà retiré/);
  assert.equal((await prisma.vote.findUniqueOrThrow({ where: { id: vote.id } })).cancelledAt, null, "rien n'a changé");
});

test("l'ancienne route de suppression fait la même annulation tracée (plus rien de silencieux)", async () => {
  const { vote } = await seed();
  const result = await service.deleteVote(superAdmin(), vote.id);
  assert.equal(result.cancelled, true);
  assert.ok((await prisma.vote.findUniqueOrThrow({ where: { id: vote.id } })).cancelledAt);
  assert.equal(await prisma.auditLog.count({ where: { action: "vote.cancelled", targetId: vote.id } }), 1);
});

test("overview: après annulation, le vote compte comme annulé et son montant est à rembourser", async () => {
  const { vote } = await seed();
  const before = await service.getOverview();
  assert.equal(before.votes.active, 1);
  assert.equal(before.grossRevenueCfa, 1000);
  await service.cancelVote(superAdmin(), vote.id, { reason: "test" });
  const after = await service.getOverview();
  assert.equal(after.votes.active, 0);
  assert.equal(after.votes.cancelled, 1);
  assert.equal(after.grossRevenueCfa, 0);
  assert.equal(after.commissionCfa, 0);
  assert.equal(after.refundDueToVotersCfa, 1000);
});

test("listVotes: renvoie le titre de l'événement et le nom du candidat (lisibles côté admin)", async () => {
  const { vote } = await seed();
  const page = await service.listVotes({});
  const row = page.items.find((item) => item.id === vote.id);
  assert.ok(row);
  assert.equal(row.event.title, "Miss Campus 2026");
  assert.equal(row.candidate.fullName, "Arielle Dossou");
});
