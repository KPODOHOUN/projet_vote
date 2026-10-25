import "reflect-metadata";
import { test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { TenantOfferType, UserRole, WalletLedgerKind, WithdrawalStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { WalletService } from "./wallet.service";
import { WithdrawalsService } from "./withdrawals.service";

const prismaService = new PrismaService();
const wallet = new WalletService(prismaService);
const withdrawals = new WithdrawalsService(prismaService, wallet);

before(async () => {
  assertTestDatabase();
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

async function seedOrganizer(withdrawableCfa: number) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const tenant = await prisma.tenant.create({
    data: {
      slug: `wd-${suffix}`,
      displayName: "Retraits",
      offerType: TenantOfferType.ESCROW,
      payoutNetwork: "MTN",
      payoutPhoneEnc: "iv:tag:cipher",
      payoutPhoneLast4: "3456"
    }
  });
  await wallet.creditSplit({ tenantId: tenant.id, netCfa: withdrawableCfa, heldBps: 0, kind: WalletLedgerKind.VOTE_CREDIT });
  const organizer: AuthUser = { userId: `owner-${suffix}`, tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: `o-${suffix}@test.dev` };
  const admin: AuthUser = { userId: `admin-${suffix}`, tenantId: tenant.id, role: UserRole.PLATFORM_ADMIN, email: `a-${suffix}@test.dev` };
  return { tenant, organizer, admin };
}

async function balances(tenantId: string) {
  const w = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId } });
  return { held: w.heldCfa, withdrawable: w.withdrawableCfa };
}

/** Total signé du ledger pour ce flux : crédits de vote et restitutions de rejet (+), demandes de retrait (−). */
async function ledgerTotal(tenantId: string) {
  const w = await prisma.organizerWallet.findUniqueOrThrow({ where: { tenantId } });
  const entries = await prisma.walletLedgerEntry.findMany({ where: { walletId: w.id } });
  return entries.reduce((sum, e) => {
    if (e.kind === WalletLedgerKind.WITHDRAWAL_DEBIT) return sum - e.amountCfa;
    if (e.kind === WalletLedgerKind.HELD_ALLOCATION || e.kind === WalletLedgerKind.HELD_RELEASE) return sum;
    return sum + e.amountCfa;
  }, 0);
}

test("retrait: la demande débite tout de suite le disponible et le ledger reste égal aux soldes", async () => {
  const { tenant, organizer } = await seedOrganizer(10_000);
  const request = await withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 });
  assert.equal(request.status, WithdrawalStatus.PENDING);
  assert.deepEqual(await balances(tenant.id), { held: 0, withdrawable: 6_000 });
  assert.equal(await ledgerTotal(tenant.id), 6_000);
});

test("retrait: un montant supérieur au disponible est refusé sans rien débiter", async () => {
  const { tenant, organizer } = await seedOrganizer(1_000);
  await assert.rejects(withdrawals.requestWithdrawal(organizer, { amountCfa: 1_001 }), /supérieur au solde/);
  assert.deepEqual(await balances(tenant.id), { held: 0, withdrawable: 1_000 });
});

test("retrait: deux demandes simultanées ne peuvent pas dépenser deux fois le même disponible", async () => {
  const { tenant, organizer } = await seedOrganizer(5_000);
  const results = await Promise.allSettled([
    withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 }),
    withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await balances(tenant.id), { held: 0, withdrawable: 1_000 });
  assert.equal(await prisma.withdrawalRequest.count({ where: { tenantId: tenant.id } }), 1);
});

test("retrait: un rejet exige un motif, rend la somme au disponible et laisse une trace d'audit", async () => {
  const { tenant, organizer, admin } = await seedOrganizer(10_000);
  const request = await withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 });
  await assert.rejects(withdrawals.reject(admin, request.id, { reason: "no" }));
  const rejected = await withdrawals.reject(admin, request.id, { reason: "Numéro introuvable" });
  assert.equal(rejected.status, WithdrawalStatus.REJECTED);
  assert.deepEqual(await balances(tenant.id), { held: 0, withdrawable: 10_000 });
  assert.equal(await ledgerTotal(tenant.id), 10_000);
  const audit = await prisma.auditLog.findFirst({ where: { action: "withdrawal.rejected", targetId: request.id } });
  assert.equal(audit?.actorUserId, admin.userId);
});

test("retrait: deux rejets simultanés ne rendent la somme qu'une fois", async () => {
  const { tenant, organizer, admin } = await seedOrganizer(10_000);
  const request = await withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 });
  const results = await Promise.allSettled([
    withdrawals.reject(admin, request.id, { reason: "Doublon 1" }),
    withdrawals.reject(admin, request.id, { reason: "Doublon 2" })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await balances(tenant.id), { held: 0, withdrawable: 10_000 });
});

test("retrait: un rejet et une approbation simultanés ne peuvent pas réussir tous les deux", async () => {
  const { tenant, organizer, admin } = await seedOrganizer(10_000);
  const request = await withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 });
  const results = await Promise.allSettled([
    withdrawals.reject(admin, request.id, { reason: "Refus concurrent" }),
    withdrawals.approve(admin, request.id)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const final = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } });
  const { withdrawable } = await balances(tenant.id);
  if (final.status === WithdrawalStatus.REJECTED) assert.equal(withdrawable, 10_000);
  else assert.equal(withdrawable, 6_000);
});

test("retrait: approuver puis marquer payé suit PENDING → APPROVED → PAID, sans retour possible", async () => {
  const { tenant, organizer, admin } = await seedOrganizer(10_000);
  const request = await withdrawals.requestWithdrawal(organizer, { amountCfa: 4_000 });
  await assert.rejects(withdrawals.markPaid(admin, request.id), /Transition invalide/);
  await withdrawals.approve(admin, request.id);
  const paid = await withdrawals.markPaid(admin, request.id);
  assert.equal(paid.status, WithdrawalStatus.PAID);
  await assert.rejects(withdrawals.reject(admin, request.id, { reason: "Trop tard" }));
  assert.deepEqual(await balances(tenant.id), { held: 0, withdrawable: 6_000 });
  const actions = (await prisma.auditLog.findMany({ where: { targetId: request.id } })).map((a) => a.action).sort();
  assert.deepEqual(actions, ["withdrawal.approved", "withdrawal.marked_paid", "withdrawal.requested"]);
});
