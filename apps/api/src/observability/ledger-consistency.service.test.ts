import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import {
  EventStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  TenantOfferType,
  UserRole,
  WalletLedgerKind
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { WalletService } from "../offers/wallet.service";
import { WithdrawalsService } from "../offers/withdrawals.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerConsistencyService } from "./ledger-consistency.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";

const prismaService = new PrismaService();
const ledger = new LedgerConsistencyService(prismaService);
const wallet = new WalletService(prismaService);
const withdrawals = new WithdrawalsService(prismaService, wallet);

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

// ── ADR-021 : soldes stockés ↔ journal signé ─────────────────────────────

async function seedEscrowTenant() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `rec-${suffix}`,
      displayName: "Réconciliation",
      offerType: TenantOfferType.ESCROW,
      payoutNetwork: "MTN",
      payoutPhoneEnc: "iv:tag:cipher",
      payoutPhoneLast4: "3456"
    }
  });
  const organizer: AuthUser = { userId: `owner-${suffix}`, tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: `o-${suffix}@test.dev` };
  const admin: AuthUser = { userId: `admin-${suffix}`, tenantId: tenant.id, role: UserRole.PLATFORM_ADMIN, email: `a-${suffix}@test.dev` };
  return { tenant, organizer, admin };
}

function checkFor(report: Awaited<ReturnType<LedgerConsistencyService["reconcileWallets"]>>, tenantId: string) {
  const check = report.wallets.find((w) => w.tenantId === tenantId);
  assert.ok(check, "wallet absent du rapport");
  return check;
}

test("wallet : crédit de vote, réserve, libération, retrait demandé, rejeté, payé → soldes = journal", async () => {
  const { tenant, organizer, admin } = await seedEscrowTenant();
  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 10_000, heldBps: 3_000, kind: WalletLedgerKind.VOTE_CREDIT });
  await wallet.credit({ tenantId: tenant.id, amountCfa: 2_000, kind: WalletLedgerKind.VOTE_CREDIT, target: "held" });
  await wallet.debit({ tenantId: tenant.id, amountCfa: 100, kind: WalletLedgerKind.RETENTION_DEBIT, from: "held" });
  await wallet.releaseHeldToWithdrawable({ tenantId: tenant.id, amountCfa: 1_000 });
  const rejected = await withdrawals.requestWithdrawal(organizer, { amountCfa: 2_000 });
  await withdrawals.reject(admin, rejected.id, { reason: "Numéro invalide" });
  const paid = await withdrawals.requestWithdrawal(organizer, { amountCfa: 1_500 });
  await withdrawals.approve(admin, paid.id);
  await withdrawals.markPaid(admin, paid.id);

  const check = checkFor(await ledger.reconcileWallets(), tenant.id);
  assert.deepEqual(
    { status: check.status, held: check.ledgerHeldCfa, withdrawable: check.ledgerWithdrawableCfa, unknown: check.unknownEntries },
    { status: "ok", held: 3_900, withdrawable: 6_500, unknown: 0 }
  );
  assert.equal(check.storedHeldCfa, 3_900);
  assert.equal(check.storedWithdrawableCfa, 6_500);
});

test("wallet : un solde modifié hors journal est signalé en écart", async () => {
  const { tenant } = await seedEscrowTenant();
  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 5_000, heldBps: 2_000, kind: WalletLedgerKind.VOTE_CREDIT });
  await prisma.organizerWallet.update({ where: { tenantId: tenant.id }, data: { withdrawableCfa: { increment: 1 } } });

  const report = await ledger.reconcileWallets();
  const check = checkFor(report, tenant.id);
  assert.equal(check.status, "drift");
  assert.equal(check.storedWithdrawableCfa - check.ledgerWithdrawableCfa, 1);
  assert.equal(report.driftCount, 1);
});

test("wallet : une ligne sans sens est comptée inconnue, jamais additionnée", async () => {
  const { tenant } = await seedEscrowTenant();
  await wallet.credit({ tenantId: tenant.id, amountCfa: 800, kind: WalletLedgerKind.TOPUP_CREDIT, target: "withdrawable" });
  const w = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  // Ligne antérieure à ADR-021 dont le backfill n'a pas pu décider.
  await prisma.walletLedgerEntry.create({
    data: { walletId: w.id, kind: WalletLedgerKind.ADJUSTMENT, amountCfa: 50, note: "legacy" }
  });

  const report = await ledger.reconcileWallets();
  const check = checkFor(report, tenant.id);
  assert.equal(check.status, "unverifiable");
  assert.equal(check.unknownEntries, 1);
  assert.equal(check.ledgerWithdrawableCfa, 800);
  assert.equal(report.unknownEntries, 1);
});

test("wallet : crédits et demandes de retrait concurrents laissent soldes = journal", async () => {
  const { tenant, organizer } = await seedEscrowTenant();
  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 3_000, heldBps: 0, kind: WalletLedgerKind.VOTE_CREDIT });
  await Promise.allSettled([
    withdrawals.requestWithdrawal(organizer, { amountCfa: 2_000 }),
    withdrawals.requestWithdrawal(organizer, { amountCfa: 2_000 }),
    wallet.creditSplit({ tenantId: tenant.id, netCfa: 1_000, heldBps: 5_000, kind: WalletLedgerKind.VOTE_CREDIT }),
    wallet.creditSplit({ tenantId: tenant.id, netCfa: 1_000, heldBps: 5_000, kind: WalletLedgerKind.VOTE_CREDIT })
  ]);

  const check = checkFor(await ledger.reconcileWallets(), tenant.id);
  assert.equal(check.status, "ok");
  assert.equal(check.storedHeldCfa, 1_000);
});
