import assert from "node:assert/strict";
import test from "node:test";
import { EventStatus, TenantOfferType, UserRole, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";
import { OfferSettingsService } from "./offer-settings.service";
import { EventStatsService } from "./event-stats.service";
import { EventSettlementService } from "./event-settlement.service";
import { OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY } from "../common/platform-settings";

const prisma = new PrismaService();
const wallet = new WalletService(prisma);
const offerSettings = new OfferSettingsService(prisma);
const eventStats = new EventStatsService(prisma, wallet);
const settlement = new EventSettlementService(prisma, wallet, offerSettings, eventStats);

test("closeEvent: n'applique PAS la retenue 5% quand la commission par vote est active", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "true", updatedByUserId: "test" },
    update: { value: "true" }
  });
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `close-novote-${Date.now().toString(36)}`,
      displayName: "Close No Retention",
      offerType: TenantOfferType.ESCROW
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Close no retention",
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
  assert.equal(result.retentionCfa, 0);
});

test("releaseMaturedHeld: libère le held des events clôturés il y a plus de 48h, pas les plus récents", async () => {
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `release-${Date.now().toString(36)}`,
      displayName: "Release Held",
      offerType: TenantOfferType.ESCROW
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
