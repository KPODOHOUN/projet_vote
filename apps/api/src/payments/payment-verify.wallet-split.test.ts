import assert from "node:assert/strict";
import test from "node:test";
import { PaymentProvider, PaymentPurpose, PaymentStatus, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "../offers/wallet.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { PaymentVerifyService } from "./payment-verify.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PspRegistry } from "./psp/psp.registry";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);
const offerSettings = new OfferSettingsService(prisma);
const notifications = new NotificationsService(prisma);
const pspRegistry = {} as PspRegistry; // non utilisé par applyDemoSuccess
const verifyService = new PaymentVerifyService(prisma, notifications, pspRegistry, wallet, offerSettings);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Concours publié : taux et réserve figés comme par un contrat signé (12 %, 50 %). */
async function seedPublishedEvent() {
  const tenant = await prisma.client.tenant.create({ data: { slug: `pv-${uid()}`, displayName: "PV" } });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Concours",
      slug: `ev-pv-${uid()}`,
      status: "ACTIVE",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      commissionBps: 1_200,
      heldBps: 5_000
    }
  });
  const candidate = await prisma.client.candidate.create({ data: { eventId: event.id, fullName: "Candidate", publicRef: `cand-${uid()}` } });
  return { tenant, event, candidate };
}

async function pendingTx(ctx: Awaited<ReturnType<typeof seedPublishedEvent>>, purpose: PaymentPurpose, amountCfa: number) {
  const vote =
    purpose === PaymentPurpose.TICKET
      ? null
      : await prisma.client.vote.create({
          data: { tenantId: ctx.tenant.id, eventId: ctx.event.id, candidateId: ctx.candidate.id, amountCfa }
        });
  return prisma.client.paymentTransaction.create({
    data: {
      tenantId: ctx.tenant.id,
      eventId: ctx.event.id,
      voteId: vote?.id ?? null,
      purpose,
      provider: PaymentProvider.FEEXPAY,
      status: PaymentStatus.PENDING,
      amountCfa,
      currency: "XOF",
      idempotencyKey: `idem-${uid()}`,
      providerRef: `demo_${uid()}`
    }
  });
}

test("vote de 1 000 F : commission 120 F (12 %), net 880 F partagé 440 réserve / 440 disponible", async () => {
  const ctx = await seedPublishedEvent();
  const tx = await pendingTx(ctx, PaymentPurpose.VOTE, 1_000);
  await verifyService.applyDemoSuccess(tx.id);

  assert.equal((await prisma.client.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).commissionCfa, 120);
  const w = await wallet.getWallet(ctx.tenant.id);
  assert.equal(w.heldCfa, 440);
  assert.equal(w.withdrawableCfa, 440);
  assert.ok(w.recentEntries.some((e) => e.kind === WalletLedgerKind.VOTE_CREDIT && e.amountCfa === 440));
});

test("billet de 1 500 F : même règle, écriture « billets » (et non « vote »)", async () => {
  const ctx = await seedPublishedEvent();
  const tx = await pendingTx(ctx, PaymentPurpose.TICKET, 1_500);
  await verifyService.applyDemoSuccess(tx.id);
  // commission = 180, net = 1 320, réserve = 660, disponible = 660
  const w = await wallet.getWallet(ctx.tenant.id);
  assert.equal(w.heldCfa, 660);
  assert.equal(w.withdrawableCfa, 660);
  assert.ok(w.recentEntries.some((e) => e.kind === WalletLedgerKind.TICKET_CREDIT && e.amountCfa === 660));
  assert.ok(!w.recentEntries.some((e) => e.kind === WalletLedgerKind.VOTE_CREDIT));
});

test("votes ajoutés par l'organisateur : commission et réserve comme un vote du public (plus de retrait immédiat de la totalité)", async () => {
  const ctx = await seedPublishedEvent();
  const tx = await pendingTx(ctx, PaymentPurpose.ORGANIZER_VOTE_TOPUP, 400);
  await verifyService.applyDemoSuccess(tx.id);
  // commission = 48, net = 352, réserve = 176, disponible = 176
  const w = await wallet.getWallet(ctx.tenant.id);
  assert.equal((await prisma.client.paymentTransaction.findUniqueOrThrow({ where: { id: tx.id } })).commissionCfa, 48);
  assert.equal(w.heldCfa, 176);
  assert.equal(w.withdrawableCfa, 176);
});

test("confirmation rejouée : un seul crédit, une seule commission", async () => {
  const ctx = await seedPublishedEvent();
  const tx = await pendingTx(ctx, PaymentPurpose.VOTE, 1_000);
  await Promise.all([verifyService.applyDemoSuccess(tx.id), verifyService.applyDemoSuccess(tx.id)]);
  await verifyService.applyDemoSuccess(tx.id);
  const w = await wallet.getWallet(ctx.tenant.id);
  assert.equal(w.heldCfa + w.withdrawableCfa, 880);
  assert.equal(await prisma.client.walletLedgerEntry.count({ where: { paymentId: tx.id } }), 2);
});

test("un nouveau taux ne change jamais un paiement déjà confirmé", async () => {
  const ctx = await seedPublishedEvent();
  const first = await pendingTx(ctx, PaymentPurpose.VOTE, 1_000);
  await verifyService.applyDemoSuccess(first.id);
  // L'admin fixe un autre taux au concours (cas d'école) : seuls les paiements suivants en tiennent compte.
  await prisma.client.event.update({ where: { id: ctx.event.id }, data: { commissionBps: 500 } });
  const second = await pendingTx(ctx, PaymentPurpose.VOTE, 1_000);
  await verifyService.applyDemoSuccess(second.id);
  assert.equal((await prisma.client.paymentTransaction.findUniqueOrThrow({ where: { id: first.id } })).commissionCfa, 120);
  assert.equal((await prisma.client.paymentTransaction.findUniqueOrThrow({ where: { id: second.id } })).commissionCfa, 50);
});
