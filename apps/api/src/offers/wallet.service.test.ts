import assert from "node:assert/strict";
import test from "node:test";
import { PaymentProvider, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";
import { supportsSplit } from "./psp-split.util";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);

test("supportsSplit: seul FedaPay Marketplace est compatible par défaut", async () => {
  const noSettings = {
    platformSetting: {
      findUnique: async () => null
    }
  };
  assert.equal(await supportsSplit(noSettings, PaymentProvider.FEEXPAY), false);
  assert.equal(await supportsSplit(noSettings, PaymentProvider.FEDAPAY), true);
  assert.equal(await supportsSplit(noSettings, PaymentProvider.KKIAPAY), false);
});

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
