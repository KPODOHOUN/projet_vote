import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PartnersService } from "./partners.service";
import { noopPartnerNotifications } from "./partner-notifications.stub";
import { resolvePartnerVoteCommissionBps } from "./partner-tier.util";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const service = new PartnersService(prismaService, noopPartnerNotifications());

function owner(tenantId: string) {
  return { userId: "owner-1", tenantId, email: "owner@ev.bj", role: UserRole.ORGANIZER_OWNER };
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("requestPartnership refuse sans acceptation des conditions", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "no-terms", displayName: "Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "evt-no-terms",
      title: "Test",
      status: EventStatus.DRAFT,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });

  await assert.rejects(
    () =>
      service.requestPartnership(owner(tenant.id), {
        eventId: event.id,
        reason: "Motif valide mais sans case cochée côté serveur.",
        estimatedRevenueCfa: 500_000,
        acceptedTerms: false as unknown as true
      }),
    /conditions/
  );
});

test("resolvePartnerVoteCommissionBps applique le palier selon recettes cumulées", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "tier-live", displayName: "Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "evt-tier-live",
      title: "Live tier",
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3_600_000),
      isPartnerEvent: true,
      partnerPlatformShareBps: 2500
    }
  });
  await prisma.partnerOfferTier.createMany({
    data: [
      {
        label: "Petit",
        minRevenueCfa: 0,
        maxRevenueCfa: 500_000,
        platformShareBps: 2500,
        sortOrder: 0
      },
      {
        label: "Grand",
        minRevenueCfa: 500_001,
        maxRevenueCfa: null,
        platformShareBps: 1500,
        sortOrder: 1
      }
    ]
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      provider: "FEEXPAY",
      amountCfa: 600_000,
      commissionCfa: 150_000,
      status: "SUCCEEDED",
      purpose: "VOTE",
      idempotencyKey: "idem-tier-1"
    }
  });

  const bps = await resolvePartnerVoteCommissionBps(
    prisma,
    event.id,
    event.partnerPlatformShareBps ?? 2500,
    50_000
  );
  assert.equal(bps, 1500);
});
