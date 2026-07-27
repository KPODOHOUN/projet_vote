import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { AccountPlanStatus, AccountPlanType, UserRole } from "@prisma/client";
import { SubscriptionsService } from "./subscriptions.service";
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
const pspRegistry = {} as any; // mock
const verifyService = {} as any; // mock

const subscriptionsService = new SubscriptionsService(
  prismaService,
  notificationsService,
  mailService,
  pspRegistry,
  verifyService
);

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
