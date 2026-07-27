import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { PaymentProvider, PaymentStatus, UserRole } from "@prisma/client";
import { AdminService } from "./admin.service";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

// Real-database service tests — no mock Prisma. PrismaService wraps the real
// singleton client pointed at the test database.
const prismaService = new PrismaService();
const adminService = new AdminService(prismaService, new OrganizerSecretsService(prismaService));

before(() => {
  assertTestDatabase();
});
beforeEach(async () => {
  await resetDatabase();
});
after(async () => {
  await prisma.$disconnect();
});

async function seedTenantWithUsers() {
  const tenant = await prisma.tenant.create({
    data: { slug: "tenant-a", displayName: "Tenant A" }
  });
  await prisma.user.createMany({
    data: [
      {
        tenantId: tenant.id,
        email: "owner@tenant-a.africa",
        passwordHash: "x",
        role: UserRole.ORGANIZER_OWNER
      },
      {
        tenantId: tenant.id,
        email: "staff@tenant-a.africa",
        passwordHash: "x",
        role: UserRole.ORGANIZER_STAFF
      }
    ]
  });
  return tenant;
}

test("AdminService.listUsers retourne les utilisateurs filtrés par email", async () => {
  const tenant = await seedTenantWithUsers();

  const result = await adminService.listUsers(
    {
      userId: "u-1",
      tenantId: tenant.id,
      email: "owner@tenant-a.africa",
      role: UserRole.ORGANIZER_OWNER
    },
    { email: "staff", limit: 10 }
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.email, "staff@tenant-a.africa");
  assert.equal(result.nextCursor, null);
});

test("AdminService.listUsers d'un organisateur ne voit jamais un autre tenant", async () => {
  const tenantA = await seedTenantWithUsers();
  const tenantB = await prisma.tenant.create({ data: { slug: "tenant-b", displayName: "Tenant B" } });
  await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      email: "owner@tenant-b.africa",
      passwordHash: "x",
      role: UserRole.ORGANIZER_OWNER
    }
  });

  const result = await adminService.listUsers(
    {
      userId: "u-1",
      tenantId: tenantA.id,
      email: "owner@tenant-a.africa",
      role: UserRole.ORGANIZER_OWNER
    },
    { limit: 50 }
  );

  assert.equal(result.items.length, 2);
  assert.ok(result.items.every((u) => u.tenantId === tenantA.id));
});

test("AdminService.updateUser suspend puis réactive un compte", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "suspend-t", displayName: "Suspend T" } });
  const target = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "target@suspend.africa",
      passwordHash: "x",
      role: UserRole.ORGANIZER_OWNER,
      emailVerifiedAt: new Date()
    }
  });
  const admin = {
    userId: "admin-1",
    tenantId: tenant.id,
    email: "admin@shadoma.africa",
    role: UserRole.PLATFORM_ADMIN
  };

  const suspended = await adminService.updateUser(admin, target.id, { suspended: true, suspendedReason: "Test" });
  assert.ok(suspended.suspendedAt);
  assert.equal(suspended.suspendedReason, "Test");

  const reactivated = await adminService.updateUser(admin, target.id, { suspended: false });
  assert.equal(reactivated.suspendedAt, null);
});

test("AdminService.getSubscriptionsOverview agrège correctement les revenus", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "tenant-a", displayName: "Tenant A" } });
  await prisma.paymentTransaction.createMany({
    data: [
      {
        tenantId: tenant.id,
        eventId: "evt-1",
        provider: PaymentProvider.FEEXPAY,
        amountCfa: 2000,
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "sub-overview-key-0001"
      },
      {
        tenantId: tenant.id,
        eventId: "evt-1",
        provider: PaymentProvider.FEEXPAY,
        amountCfa: 1500,
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "sub-overview-key-0002"
      }
    ]
  });

  const day = 24 * 60 * 60 * 1000;
  const result = await adminService.getSubscriptionsOverview(
    {
      userId: "admin-1",
      tenantId: tenant.id,
      email: "admin@votezpro.africa",
      role: UserRole.PLATFORM_ADMIN
    },
    {
      from: new Date(Date.now() - 40 * day).toISOString(),
      to: new Date(Date.now() + day).toISOString()
    }
  );

  assert.equal(result.totals.tenantsWithRevenue, 1);
  assert.equal(result.totals.totalRevenueCfa, 3500);
  assert.equal(result.items[0]?.subscriptionState, "ACTIVE");
});

test("AdminService.listAuditLogs: scope tenant (owner) + filtre action + pagination curseur", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "audit-a", displayName: "A" } });
  const other = await prisma.tenant.create({ data: { slug: "audit-b", displayName: "B" } });
  for (let i = 0; i < 3; i += 1) {
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: "u",
        actorRole: UserRole.ORGANIZER_OWNER,
        action: "event.created",
        targetType: "Event",
        targetId: `e${i}`
      }
    });
  }
  await prisma.auditLog.create({
    data: {
      tenantId: other.id,
      actorUserId: "u",
      actorRole: UserRole.ORGANIZER_OWNER,
      action: "event.created",
      targetType: "Event",
      targetId: "x"
    }
  });

  const owner = { userId: "o", tenantId: tenant.id, email: "o@a", role: UserRole.ORGANIZER_OWNER };
  const page1 = await adminService.listAuditLogs(owner, { limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);
  assert.ok(page1.items.every((l) => l.tenantId === tenant.id)); // jamais le tenant voisin

  const page2 = await adminService.listAuditLogs(owner, { limit: 2, cursor: page1.nextCursor });
  assert.equal(page2.items.length, 1);

  const none = await adminService.listAuditLogs(owner, { action: "nope.action" });
  assert.equal(none.items.length, 0);
});

test("AdminService.featureFlags: upsert puis list (round-trip chiffré via secrets)", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "ff-a", displayName: "FF" } });
  const owner = { userId: "o", tenantId: tenant.id, email: "o@a", role: UserRole.ORGANIZER_OWNER };
  await adminService.upsertFeatureFlag(owner, { key: "new_dashboard", enabled: true, rolloutPercent: 50 });

  const flags = await adminService.listFeatureFlags(owner, {});
  const flag = flags.items.find((f) => f.key === "new_dashboard");
  assert.ok(flag);
  assert.equal(flag.enabled, true);
  assert.equal(flag.rolloutPercent, 50);
});

test("AdminService.getJobsOverview: compteurs + expiredIdempotencyKeys masqué aux organisateurs (L6)", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "jobs-a", displayName: "Jobs" } });
  await prisma.paymentTransaction.create({
    data: {
      tenantId: tenant.id,
      eventId: "e1",
      provider: PaymentProvider.FEEXPAY,
      amountCfa: 100,
      status: PaymentStatus.PENDING,
      idempotencyKey: "jobs-pending-1"
    }
  });
  await prisma.idempotencyKey.create({
    data: { key: "expired-1", scope: "x", requestHash: "h", expiresAt: new Date(Date.now() - 1000) }
  });

  const owner = { userId: "o", tenantId: tenant.id, email: "o@a", role: UserRole.ORGANIZER_OWNER };
  const ownerView = await adminService.getJobsOverview(owner);
  assert.equal(ownerView.pendingPayments, 1);
  assert.equal(ownerView.expiredIdempotencyKeys, 0); // L6 : signal global caché aux organisateurs

  const admin = { userId: "a", tenantId: tenant.id, email: "a@a", role: UserRole.PLATFORM_ADMIN };
  const adminView = await adminService.getJobsOverview(admin);
  assert.ok(adminView.expiredIdempotencyKeys >= 1);
});
