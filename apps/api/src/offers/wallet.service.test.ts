import assert from "node:assert/strict";
import test from "node:test";
import { PaymentProvider, PaymentPurpose, PaymentStatus, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);

test("wallet credit puis debit conserve le solde", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `wal-${Date.now().toString(36)}`,
      displayName: "Wallet Test"
    }
  });
  await wallet.credit({
    tenantId: tenant.id,
    amountCfa: 10_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    target: "withdrawable",
    note: "test credit"
  });
  let w = await wallet.getWallet(tenant.id);
  assert.equal(w.withdrawableCfa, 10_000);

  await wallet.debit({
    tenantId: tenant.id,
    amountCfa: 3_000,
    kind: WalletLedgerKind.WITHDRAWAL_DEBIT,
    from: "withdrawable",
    note: "test debit"
  });
  w = await wallet.getWallet(tenant.id);
  assert.equal(w.withdrawableCfa, 7_000);
});

test("creditSplit répartit net en held + withdrawable selon heldBps", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `wal-split-${Date.now().toString(36)}`,
      displayName: "Wallet Split Test"
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 10_000,
    heldBps: 5_000, // 50%
    kind: WalletLedgerKind.VOTE_CREDIT,
    note: "test split"
  });
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 5_000);
  assert.equal(w.withdrawableCfa, 5_000);
});

test("creditSplit avec heldBps=0 crédite tout en withdrawable", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `wal-split0-${Date.now().toString(36)}`,
      displayName: "Wallet Split Zero"
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 7_000,
    heldBps: 0,
    kind: WalletLedgerKind.VOTE_CREDIT,
    note: "test split zero held"
  });
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 0);
  assert.equal(w.withdrawableCfa, 7_000);
});

test("getWallet expose la commission prélevée et le détail par événement, calculés côté serveur depuis le journal", async () => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.client.tenant.create({ data: { slug: `wal-com-${suffix}`, displayName: "Wallet Commission" } });
  const other = await prisma.client.tenant.create({ data: { slug: `wal-oth-${suffix}`, displayName: "Autre" } });
  const mkEvent = (tenantId: string, slug: string, title: string) =>
    prisma.client.event.create({
      data: { tenantId, slug, title, status: "ACTIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000) }
    });
  const evA = await mkEvent(tenant.id, `wal-a-${suffix}`, "Concours A");
  const evB = await mkEvent(tenant.id, `wal-b-${suffix}`, "Concours B");
  const evOther = await mkEvent(other.id, `wal-o-${suffix}`, "Autre concours");
  const pay = (tenantId: string, eventId: string, amountCfa: number, commissionCfa: number, n: number) =>
    prisma.client.paymentTransaction.create({
      data: {
        tenantId,
        eventId,
        purpose: PaymentPurpose.VOTE,
        provider: PaymentProvider.FEEXPAY,
        status: PaymentStatus.SUCCEEDED,
        amountCfa,
        commissionCfa,
        currency: "XOF",
        idempotencyKey: `wal-com-${suffix}-${n}`
      }
    });
  const p1 = await pay(tenant.id, evA.id, 1_000, 100, 1);
  const p2 = await pay(tenant.id, evB.id, 2_000, 200, 2);
  const pOther = await pay(other.id, evOther.id, 5_000, 500, 3);
  // Paiement réussi mais jamais crédité au wallet : sa commission ne compte pas.
  await pay(tenant.id, evA.id, 9_000, 900, 4);

  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 900, heldBps: 2_000, kind: WalletLedgerKind.VOTE_CREDIT, eventId: evA.id, paymentId: p1.id });
  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 1_800, heldBps: 0, kind: WalletLedgerKind.VOTE_CREDIT, eventId: evB.id, paymentId: p2.id });
  await wallet.creditSplit({ tenantId: other.id, netCfa: 4_500, heldBps: 0, kind: WalletLedgerKind.VOTE_CREDIT, eventId: evOther.id, paymentId: pOther.id });
  await wallet.releaseHeldToWithdrawable({ tenantId: tenant.id, amountCfa: 80, eventId: evA.id });

  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.commissionCfa, 300);
  const byId = new Map(w.byEvent.map((e) => [e.eventId, e]));
  assert.equal(byId.size, 2, "aucun événement d'un autre organisateur");
  assert.deepEqual(byId.get(evA.id), { eventId: evA.id, title: "Concours A", grossCfa: 1_000, commissionCfa: 100, heldCfa: 100, creditedAvailableCfa: 800 });
  assert.deepEqual(byId.get(evB.id), { eventId: evB.id, title: "Concours B", grossCfa: 2_000, commissionCfa: 200, heldCfa: 0, creditedAvailableCfa: 1_800 });
});
