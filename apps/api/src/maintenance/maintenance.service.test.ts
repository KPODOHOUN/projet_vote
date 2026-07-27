import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { MaintenanceService } from "./maintenance.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

// Real-database test — verifies the purge query path, constraints and cascades
// against the real client. Covers both scopes: platform operators purge
// platform-wide (the cron path runs as PLATFORM_ADMIN), while non-platform
// roles are strictly confined to their own tenant. No mock Prisma client.
const maintenanceService = new MaintenanceService(new PrismaService());

const DAY = 24 * 60 * 60 * 1000;
const OLD = new Date(Date.now() - 400 * DAY); // beyond every retention window
const RECENT = new Date(Date.now() - 1 * DAY);

before(() => {
  assertTestDatabase();
});
beforeEach(async () => {
  await resetDatabase();
});
after(async () => {
  await prisma.$disconnect();
});

async function seedTwoTenants() {
  const tenantA = await prisma.tenant.create({ data: { slug: "tenant-a", displayName: "Tenant A" } });
  const tenantB = await prisma.tenant.create({ data: { slug: "tenant-b", displayName: "Tenant B" } });
  const userA = await prisma.user.create({
    data: { tenantId: tenantA.id, email: "a@a.africa", passwordHash: "x", role: UserRole.ORGANIZER_OWNER }
  });
  const userB = await prisma.user.create({
    data: { tenantId: tenantB.id, email: "b@b.africa", passwordHash: "x", role: UserRole.ORGANIZER_OWNER }
  });

  await prisma.auditLog.createMany({
    data: [
      { id: "a-old", tenantId: tenantA.id, actorUserId: userA.id, actorRole: UserRole.ORGANIZER_OWNER, action: "x", targetType: "X", createdAt: OLD },
      { id: "a-recent", tenantId: tenantA.id, actorUserId: userA.id, actorRole: UserRole.ORGANIZER_OWNER, action: "x", targetType: "X", createdAt: RECENT },
      { id: "b-old", tenantId: tenantB.id, actorUserId: userB.id, actorRole: UserRole.ORGANIZER_OWNER, action: "x", targetType: "X", createdAt: OLD }
    ]
  });

  await prisma.authSession.createMany({
    data: [
      { id: "sa-old", tenantId: tenantA.id, userId: userA.id, refreshTokenHash: "ha", expiresAt: OLD, revokedAt: OLD },
      { id: "sb-old", tenantId: tenantB.id, userId: userB.id, refreshTokenHash: "hb", expiresAt: OLD, revokedAt: OLD }
    ]
  });

  await prisma.idempotencyKey.createMany({
    data: [
      { id: "i-old", key: "k-old", scope: "test", requestHash: "h", createdAt: OLD, expiresAt: OLD },
      { id: "i-recent", key: "k-recent", scope: "test", requestHash: "h", createdAt: RECENT, expiresAt: new Date(Date.now() + DAY) }
    ]
  });

  await prisma.loginAttempt.createMany({
    data: [
      { id: "la-stale", identifier: "stale:a@a.africa", count: 2, lockedUntil: null, updatedAt: OLD, createdAt: OLD },
      { id: "la-locked", identifier: "locked:b@b.africa", count: 5, lockedUntil: new Date(Date.now() + DAY), updatedAt: OLD, createdAt: OLD }
    ]
  });

  return { tenantA, tenantB };
}

test("MaintenanceService.purge (opérateur plateforme) purge platform-wide", async () => {
  const { tenantA, tenantB } = await seedTwoTenants();

  const result = await maintenanceService.purge(
    {
      userId: "system:maintenance:cron",
      tenantId: tenantA.id,
      email: "system@votezpro.africa",
      role: UserRole.PLATFORM_ADMIN
    },
    { auditLogsRetentionDays: 365, idempotencyRetentionDays: 30, revokedSessionsRetentionDays: 30 }
  );

  // Platform operator: stale rows are purged across every tenant (the cron
  // path runs as PLATFORM_ADMIN). Both tenant-a and tenant-b stale audit logs go.
  assert.equal(result.deletedAuditLogs, 2);
  assert.equal(await prisma.auditLog.findUnique({ where: { id: "a-old" } }), null);
  assert.notEqual(await prisma.auditLog.findUnique({ where: { id: "a-recent" } }), null); // within retention
  assert.equal(await prisma.auditLog.findUnique({ where: { id: "b-old" } }), null); // other tenant also purged

  assert.equal(result.deletedRevokedSessions, 2);
  assert.equal(await prisma.authSession.findUnique({ where: { id: "sa-old" } }), null);
  assert.equal(await prisma.authSession.findUnique({ where: { id: "sb-old" } }), null); // other tenant also purged

  // Global table (no tenant column): expired keys purged platform-wide
  assert.equal(result.deletedIdempotencyKeys, 1);
  assert.equal(await prisma.idempotencyKey.findUnique({ where: { id: "i-old" } }), null);
  assert.notEqual(await prisma.idempotencyKey.findUnique({ where: { id: "i-recent" } }), null);

  // Stale (unlocked) brute-force counters purged; active locks preserved.
  assert.equal(result.deletedLoginAttempts, 1);
  assert.equal(await prisma.loginAttempt.findUnique({ where: { id: "la-stale" } }), null);
  assert.notEqual(await prisma.loginAttempt.findUnique({ where: { id: "la-locked" } }), null);

  // The purge writes its own audit log scoped to the calling tenant.
  const purgeLogs = await prisma.auditLog.findMany({ where: { tenantId: tenantA.id, action: "maintenance.purge_executed" } });
  assert.equal(purgeLogs.length, 1);
  void tenantB;
});

test("MaintenanceService.purge (rôle non-plateforme) reste confiné au tenant appelant", async () => {
  const { tenantA, tenantB } = await seedTwoTenants();

  const result = await maintenanceService.purge(
    {
      userId: "user-a",
      tenantId: tenantA.id,
      email: "a@a.africa",
      role: UserRole.ORGANIZER_OWNER
    },
    { auditLogsRetentionDays: 365, idempotencyRetentionDays: 30, revokedSessionsRetentionDays: 30 }
  );

  // Non-platform role: tenant-scoped tables are purged strictly within the
  // caller's tenant. Tenant-b rows must be preserved.
  assert.equal(result.deletedAuditLogs, 1);
  assert.equal(await prisma.auditLog.findUnique({ where: { id: "a-old" } }), null);
  assert.notEqual(await prisma.auditLog.findUnique({ where: { id: "a-recent" } }), null);
  assert.notEqual(await prisma.auditLog.findUnique({ where: { id: "b-old" } }), null); // tenant-b preserved

  assert.equal(result.deletedRevokedSessions, 1);
  assert.equal(await prisma.authSession.findUnique({ where: { id: "sa-old" } }), null);
  assert.notEqual(await prisma.authSession.findUnique({ where: { id: "sb-old" } }), null); // tenant-b preserved

  // Global tables (no tenant column) are still purged platform-wide.
  assert.equal(result.deletedIdempotencyKeys, 1);
  assert.equal(await prisma.idempotencyKey.findUnique({ where: { id: "i-old" } }), null);
  assert.notEqual(await prisma.idempotencyKey.findUnique({ where: { id: "i-recent" } }), null);

  assert.equal(result.deletedLoginAttempts, 1);
  assert.equal(await prisma.loginAttempt.findUnique({ where: { id: "la-stale" } }), null);
  assert.notEqual(await prisma.loginAttempt.findUnique({ where: { id: "la-locked" } }), null);

  void tenantB;
});
