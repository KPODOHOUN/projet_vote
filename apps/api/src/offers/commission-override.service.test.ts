import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CommissionOverrideService } from "./commission-override.service";

const prisma = new PrismaService();
const overrides = new CommissionOverrideService(prisma, new NotificationsService(prisma));

function adminUser(role: UserRole) {
  return { userId: "admin-1", tenantId: "n/a", role, email: "admin@test.dev" };
}

test("setEventCommission: accepte un taux dans la fourchette 4-12% pour un admin normal", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-event-${Date.now().toString(36)}`, displayName: "CO Event" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO event",
      slug: `ev-co-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const result = await overrides.setEventCommission(adminUser(UserRole.PLATFORM_ADMIN), event.id, 800);
  assert.equal(result.commissionBps, 800);
  const updated = await prisma.client.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(updated.commissionBps, 800);
});

test("setEventCommission: rejette un admin normal hors fourchette 4-12%", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-reject-${Date.now().toString(36)}`, displayName: "CO Reject" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO reject",
      slug: `ev-reject-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  await assert.rejects(
    () => overrides.setEventCommission(adminUser(UserRole.PLATFORM_ADMIN), event.id, 300),
    /super-admin/i
  );
});

test("setEventCommission: un super-admin peut sortir de la fourchette 4-12%, et ça écrit un audit log", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-super-${Date.now().toString(36)}`, displayName: "CO Super" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO super",
      slug: `ev-super-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const result = await overrides.setEventCommission(
    adminUser(UserRole.PLATFORM_SUPER_ADMIN),
    event.id,
    300
  );
  assert.equal(result.commissionBps, 300);

  const audits = await prisma.client.auditLog.findMany({
    where: { targetType: "Event", targetId: event.id, action: "commission.override_event" }
  });
  assert.equal(audits.length, 1);
  const audit = audits[0];
  assert.ok(audit);
  assert.equal((audit.metadata as { newBps: number }).newBps, 300);
});

test("setEventCommission: rejette un concours déjà publié (taux figé par le contrat)", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-frozen-${Date.now().toString(36)}`, displayName: "CO Frozen" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "CO frozen",
      slug: `ev-frozen-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      status: "ACTIVE"
    }
  });
  await assert.rejects(
    () => overrides.setEventCommission(adminUser(UserRole.PLATFORM_ADMIN), event.id, 800),
    /figé par le contrat/i
  );
});

test("setTenantCommission: ajoute une ligne d'historique, journalisée et notifiée, jamais rétroactive", async () => {
  const tenant = await prisma.client.tenant.create({
    data: { slug: `co-rate-${Date.now().toString(36)}`, displayName: "CO Rate" }
  });
  const owner = await prisma.client.user.create({
    data: { tenantId: tenant.id, email: `owner-${tenant.slug}@test.dev`, role: UserRole.ORGANIZER_OWNER }
  });
  const admin = adminUser(UserRole.PLATFORM_ADMIN);

  await assert.rejects(
    () => overrides.setTenantCommission(admin, tenant.id, { bps: 1000, effectiveFrom: new Date(Date.now() - 86_400_000), reason: "Accord" }),
    /rétroactif/
  );
  await assert.rejects(() => overrides.setTenantCommission(admin, tenant.id, { bps: 1000 }), /reason|Required|expected/i);

  const first = await overrides.setTenantCommission(admin, tenant.id, { bps: 1000, reason: "Accord annuel" });
  const later = new Date(Date.now() + 7 * 86_400_000);
  await overrides.setTenantCommission(admin, tenant.id, { bps: 900, effectiveFrom: later, reason: "Volume atteint" });

  const rates = await overrides.listTenantRates(tenant.id);
  assert.deepEqual(rates.map((r) => r.bps), [900, 1000]);
  assert.equal(rates[1]?.id, first.id, "le premier taux reste intact dans l'historique");
  const audits = await prisma.client.auditLog.count({ where: { action: "commission.tenant_rate_set", targetId: tenant.id } });
  assert.equal(audits, 2);
  const notifs = await prisma.client.notification.count({ where: { userId: owner.id, type: "COMMISSION_RATE_CHANGED" } });
  assert.equal(notifs, 2);
});
