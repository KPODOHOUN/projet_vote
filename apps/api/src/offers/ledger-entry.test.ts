import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { LedgerBucket, LedgerDirection, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

test("ADR-021 : aucune écriture du journal en dehors de appendLedgerEntry", () => {
  const root = join(__dirname, "..");
  const offenders = sourceFiles(root)
    .filter((file) => !file.endsWith(join("offers", "ledger-entry.ts")))
    .filter((file) => /walletLedgerEntry\s*\.\s*(create|createMany|update|updateMany|upsert)\b/.test(readFileSync(file, "utf8")))
    .map((file) => relative(root, file));
  assert.deepEqual(offenders, []);
});

async function newTenant(prefix: string) {
  return prisma.client.tenant.create({
    data: { slug: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, displayName: prefix }
  });
}

async function entriesOf(tenantId: string) {
  const w = await prisma.client.organizerWallet.findUniqueOrThrow({ where: { tenantId } });
  return prisma.client.walletLedgerEntry.findMany({ where: { walletId: w.id }, orderBy: { createdAt: "asc" } });
}

test("ADR-021 : chaque opération du wallet écrit son sens et son compartiment", async () => {
  const tenant = await newTenant("ledger-dir");

  await wallet.creditSplit({ tenantId: tenant.id, netCfa: 1_000, heldBps: 3_000, kind: WalletLedgerKind.VOTE_CREDIT });
  await wallet.credit({ tenantId: tenant.id, amountCfa: 400, kind: WalletLedgerKind.VOTE_CREDIT, target: "held" });
  await wallet.debit({ tenantId: tenant.id, amountCfa: 100, kind: WalletLedgerKind.WITHDRAWAL_DEBIT, from: "withdrawable" });
  await wallet.debit({ tenantId: tenant.id, amountCfa: 50, kind: WalletLedgerKind.RETENTION_DEBIT, from: "held" });
  await wallet.releaseHeldToWithdrawable({ tenantId: tenant.id, amountCfa: 200 });

  // Plusieurs écritures peuvent partager la même milliseconde : on compare sans ordre.
  const rows = (await entriesOf(tenant.id)).map((e) => [e.kind, e.amountCfa, e.direction, e.bucket]);
  const sorted = (list: unknown[][]) => list.map((r) => JSON.stringify(r)).sort();
  assert.deepEqual(sorted(rows), sorted([
    [WalletLedgerKind.HELD_ALLOCATION, 300, LedgerDirection.CREDIT, LedgerBucket.HELD],
    [WalletLedgerKind.VOTE_CREDIT, 700, LedgerDirection.CREDIT, LedgerBucket.WITHDRAWABLE],
    [WalletLedgerKind.VOTE_CREDIT, 400, LedgerDirection.CREDIT, LedgerBucket.HELD],
    [WalletLedgerKind.WITHDRAWAL_DEBIT, 100, LedgerDirection.DEBIT, LedgerBucket.WITHDRAWABLE],
    [WalletLedgerKind.RETENTION_DEBIT, 50, LedgerDirection.DEBIT, LedgerBucket.HELD],
    [WalletLedgerKind.HELD_RELEASE, 200, LedgerDirection.CREDIT, LedgerBucket.WITHDRAWABLE]
  ]));
});
