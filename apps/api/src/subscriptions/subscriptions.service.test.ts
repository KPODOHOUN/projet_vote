import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { AccountPlanStatus, AccountPlanType, EventStatus } from "@prisma/client";
import { SubscriptionsService } from "./subscriptions.service";
import { PlansService } from "../admin/plans/plans.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { PspRegistry } from "../payments/psp/psp.registry";
import { PaymentVerifyService } from "../payments/payment-verify.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
// We can mock the dependencies that are not needed for simple status checks,
// or instantiate them if they don't break.
const notificationsService = new NotificationsService(prismaService);
const mailService = new MailService();
const pspRegistry = {} as PspRegistry; // mock
const verifyService = {} as PaymentVerifyService; // mock

const subscriptionsService = new SubscriptionsService(
  prismaService,
  notificationsService,
  mailService,
  pspRegistry,
  verifyService
);

const plansService = new PlansService(prismaService);

before(() => {
  assertTestDatabase();
});
beforeEach(async () => {
  await resetDatabase();
});
after(async () => {
  await prisma.$disconnect();
});

test("SubscriptionsService.getAccountPlanStatus retourne hasPlan=false sans abonnement", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "no-sub", displayName: "No Sub" }
  });

  const status = await subscriptionsService.getAccountPlanStatus(tenant.id);
  assert.equal(status.hasPlan, false);
  assert.equal(status.canCreateEvents, false);
  assert.equal(status.canReceiveVotes, false);
});

test("SubscriptionsService.getAccountPlanStatus retourne hasPlan=true avec abonnement actif", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "active-sub", displayName: "Active Sub" }
  });

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 10); // 10 days in future

  await prisma.accountSubscription.create({
    data: {
      tenantId: tenant.id,
      planType: AccountPlanType.STANDARD,
      status: AccountPlanStatus.ACTIVE,
      startsAt: now,
      expiresAt,
      durationMonths: 1,
      frozenCommissionBps: 1000
    }
  });

  const status = await subscriptionsService.getAccountPlanStatus(tenant.id);
  assert.equal(status.hasPlan, true);
  assert.equal(status.canCreateEvents, true);
  assert.equal(status.canReceiveVotes, true);
  assert.equal(status.planType, AccountPlanType.STANDARD);
  assert.ok(status.daysRemaining >= 9 && status.daysRemaining <= 10);
});

test("SubscriptionsService.processExpirations passe les abonnements expirés à EXPIRED", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "expired-sub", displayName: "Expired Sub" }
  });

  const now = new Date();
  const startsAt = new Date(now);
  startsAt.setDate(startsAt.getDate() - 30);
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() - 1); // expired yesterday

  const sub = await prisma.accountSubscription.create({
    data: {
      tenantId: tenant.id,
      planType: AccountPlanType.STANDARD,
      status: AccountPlanStatus.ACTIVE,
      startsAt,
      expiresAt,
      durationMonths: 1,
      frozenCommissionBps: 1000
    }
  });

  const count = await subscriptionsService.processExpirations();
  assert.equal(count, 1);

  const updated = await prisma.accountSubscription.findUnique({
    where: { id: sub.id }
  });
  assert.equal(updated?.status, AccountPlanStatus.EXPIRED);
});

async function createPlanWithSubscription(input: {
  tenantId: string;
  planSlug: string;
  planName: string;
  maxEvents: number | null;
  commissionRate?: number;
}) {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);

  const plan = await prisma.plan.create({
    data: {
      name: input.planName,
      slug: input.planSlug,
      priceCfa: 5000,
      maxEvents: input.maxEvents,
      commissionRate: input.commissionRate ?? 1500,
      isActive: true
    }
  });

  await prisma.accountSubscription.create({
    data: {
      tenantId: input.tenantId,
      planType: AccountPlanType.STANDARD,
      status: AccountPlanStatus.ACTIVE,
      startsAt: now,
      expiresAt,
      durationMonths: 1,
      priceCfa: 5000,
      frozenCommissionBps: 1500,
      planId: plan.id
    }
  });

  return plan;
}

test("PlansService.getUsageStats retourne hasSubscription=false sans abonnement actif", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "usage-none", displayName: "Usage None" }
  });

  const usage = await plansService.getUsageStats(tenant.id);
  assert.equal(usage.hasSubscription, false);
  assert.equal(usage.planName, null);
  assert.equal(usage.eventsUsed, 0);
  assert.equal(usage.eventsLimit, null);
});

test("PlansService.getUsageStats compte les événements et applique la limite du plan", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "usage-limited", displayName: "Usage Limited" }
  });
  await createPlanWithSubscription({
    tenantId: tenant.id,
    planSlug: "starter-usage",
    planName: "Starter",
    maxEvents: 3,
    commissionRate: 1200
  });

  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + 7);
  for (const slug of ["usage-ev-1", "usage-ev-2"]) {
    await prisma.event.create({
      data: {
        tenantId: tenant.id,
        slug,
        title: slug,
        status: EventStatus.ACTIVE,
        startsAt,
        endsAt
      }
    });
  }

  const usage = await plansService.getUsageStats(tenant.id);
  assert.equal(usage.hasSubscription, true);
  assert.equal(usage.planName, "Starter");
  assert.equal(usage.commissionRate, 1200);
  assert.equal(usage.eventsUsed, 2);
  assert.equal(usage.eventsLimit, 3);
  assert.ok(usage.daysRemaining >= 29 && usage.daysRemaining <= 30);
});

test("PlansService.getUsageStats : plan illimité → eventsLimit null", async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: "usage-unlimited", displayName: "Usage Unlimited" }
  });
  await createPlanWithSubscription({
    tenantId: tenant.id,
    planSlug: "enterprise-usage",
    planName: "Enterprise",
    maxEvents: null
  });

  const usage = await plansService.getUsageStats(tenant.id);
  assert.equal(usage.hasSubscription, true);
  assert.equal(usage.planName, "Enterprise");
  assert.equal(usage.eventsLimit, null);
});
