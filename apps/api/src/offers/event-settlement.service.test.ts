import assert from "node:assert/strict";
import test from "node:test";
import { EventStatus, UserRole, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";
import { EventStatsService } from "./event-stats.service";
import { EventSettlementService } from "./event-settlement.service";
import { PayoutJobLockService } from "../payouts/payout-job-lock.service";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);
const eventStats = new EventStatsService(prisma, wallet);
const jobLock = new PayoutJobLockService(prisma);
const settlement = new EventSettlementService(
  prisma,
  wallet,
  eventStats,
  jobLock
);

test("closeEvent: clôture sans rien prélever ; la réserve reste bloquée jusqu'à sa libération", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `close-${Date.now().toString(36)}`,
      displayName: "Close"
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Close",
      slug: `ev-close-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      status: EventStatus.ACTIVE,
      heldBps: 5_000
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 1_000,
    heldBps: 5_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    eventId: event.id
  });

  const user = { userId: "u1", tenantId: tenant.id, role: UserRole.ORGANIZER_OWNER, email: "o@test.dev" };
  const result = await settlement.closeEvent(user, event.id);
  assert.equal(result.event.status, EventStatus.CLOSED);
  assert.ok(result.event.closedAt);
  const w = await wallet.getWallet(tenant.id);
  assert.equal(w.heldCfa, 500);
  assert.equal(w.withdrawableCfa, 500);
  await assert.rejects(() => settlement.closeEvent(user, event.id), /déjà clôturé/);
});

test("releaseMaturedHeld: libère le held des events clôturés il y a plus de 48h, pas les plus récents", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `release-${Date.now().toString(36)}`,
      displayName: "Release Held",
    }
  });
  const matureEvent = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Mature",
      slug: `ev-mature-${Date.now().toString(36)}`,
      startsAt: new Date(Date.now() - 172_800_000),
      endsAt: new Date(Date.now() - 100_000_000),
      status: EventStatus.CLOSED,
      closedAt: new Date(Date.now() - 172_800_000), // 48h+ dans le passé
      heldBps: 5_000
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 1_000,
    heldBps: 5_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    eventId: matureEvent.id
  });

  const recentEvent = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Recent",
      slug: `ev-recent-${Date.now().toString(36)}`,
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(),
      status: EventStatus.CLOSED,
      closedAt: new Date(), // clôturé maintenant, pas encore mûr
      heldBps: 5_000
    }
  });
  await wallet.creditSplit({
    tenantId: tenant.id,
    netCfa: 2_000,
    heldBps: 5_000,
    kind: WalletLedgerKind.VOTE_CREDIT,
    eventId: recentEvent.id
  });

  const result = await settlement.releaseMaturedHeld();
  assert.equal(result.released, 1);

  const w = await wallet.getWallet(tenant.id);
  // matureEvent: held=500 libéré → withdrawable += 500. recentEvent: held=1000 reste bloqué.
  assert.equal(w.heldCfa, 1_000);
  assert.equal(w.withdrawableCfa, 1_500 + 500);
});
