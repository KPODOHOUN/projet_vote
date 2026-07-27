import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PartnerRequestStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PartnersService } from "./partners.service";
import { noopPartnerNotifications } from "./partner-notifications.stub";
import { ACTIVATION_FEE_CFA_KEY } from "../common/platform-settings";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const service = new PartnersService(prismaService, noopPartnerNotifications());

function owner(tenantId: string) {
  return { userId: "owner-1", tenantId, email: "owner@ev.bj", role: UserRole.ORGANIZER_OWNER };
}
function admin() {
  return { userId: "admin-1", tenantId: "n/a", email: "admin@ev.bj", role: UserRole.PLATFORM_ADMIN };
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedTenantEvent() {
  const tenant = await prisma.tenant.create({
    data: { slug: `p-${Math.random().toString(36).slice(2, 8)}`, displayName: "Partner Org" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: `e-${Math.random().toString(36).slice(2, 8)}`,
      title: "Miss Test",
      status: EventStatus.DRAFT,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3_600_000)
    }
  });
  return { tenant, event };
}

test("requestPartnership puis approve avec palier : isPartnerEvent + dette", async () => {
  const { tenant, event } = await seedTenantEvent();
  await prisma.platformSetting.create({
    data: { key: ACTIVATION_FEE_CFA_KEY, value: "25000", updatedByUserId: "sys" }
  });
  const tier = await service.createOfferTier(admin(), {
    label: "Moyen",
    minRevenueCfa: 500_000,
    maxRevenueCfa: 2_000_000,
    platformShareBps: 2000
  });

  const req = await service.requestPartnership(owner(tenant.id), {
    eventId: event.id,
    reason: "Budget serré pour le lancement, nous comptons sur un fort volume de votes.",
    estimatedRevenueCfa: 1_000_000,
    acceptedTerms: true
  });
  assert.equal(req.status, PartnerRequestStatus.PENDING);

  const approved = await service.approveRequest(admin(), req.id, {
    offerTierId: tier.id,
    estimatedRevenueCfa: 1_000_000
  });
  assert.equal(approved.approved, true);
  assert.equal(approved.platformShareBps, 2000);

  const refreshedEvent = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.ok(refreshedEvent.activationPaidAt);
  assert.equal(refreshedEvent.status, EventStatus.ACTIVE);
  assert.equal(refreshedEvent.isPartnerEvent, true);
  assert.equal(refreshedEvent.partnerPlatformShareBps, 2000);

  const debt = await prisma.activationDebt.findUniqueOrThrow({ where: { eventId: event.id } });
  assert.equal(debt.amountCfa, 25000);
});

test("resolveTierForRevenue choisit le bon palier", async () => {
  await service.createOfferTier(admin(), {
    label: "Petit",
    minRevenueCfa: 0,
    maxRevenueCfa: 500_000,
    platformShareBps: 2500,
    sortOrder: 0
  });
  await service.createOfferTier(admin(), {
    label: "Grand",
    minRevenueCfa: 500_001,
    maxRevenueCfa: null,
    platformShareBps: 1500,
    sortOrder: 1
  });
  const tier = await service.resolveTierForRevenue(800_000);
  assert.equal(tier?.platformShareBps, 1500);
});

test("listPartnerEventsFinancials agrège les votes partenaires", async () => {
  const { tenant, event } = await seedTenantEvent();
  await prisma.event.update({
    where: { id: event.id },
    data: {
      isPartnerEvent: true,
      partnerPlatformShareBps: 2000,
      status: EventStatus.ACTIVE
    }
  });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      provider: "FEEXPAY",
      amountCfa: 1000,
      commissionCfa: 200,
      status: "SUCCEEDED",
      purpose: "VOTE",
      idempotencyKey: `idem-${Math.random()}`
    }
  });
  const rows = await service.listPartnerEventsFinancials();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.votesGrossCfa, 1000);
  assert.equal(rows[0]?.platformCommissionCfa, 200);
  assert.equal(rows[0]?.organizerGrossCfa, 800);
});
