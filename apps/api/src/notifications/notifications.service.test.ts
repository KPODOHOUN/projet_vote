import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import type { AuthUser } from "../auth/auth.types";

const service = new NotificationsService(new PrismaService());

async function seedTenant(slug: string) {
  const tenant = await prisma.tenant.create({ data: { slug, displayName: `T-${slug}` } });
  const owner = await prisma.user.create({ data: { tenantId: tenant.id, email: `owner@${slug}.africa`, passwordHash: "x", role: "ORGANIZER_OWNER" } });
  const staff = await prisma.user.create({ data: { tenantId: tenant.id, email: `staff@${slug}.africa`, passwordHash: "x", role: "ORGANIZER_STAFF" } });
  return { tenant, owner, staff };
}
function asUser(u: { id: string; tenantId: string }, role: string): AuthUser {
  return { userId: u.id, tenantId: u.tenantId, role, email: "x" } as AuthUser;
}

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("create fan-out vers les non-STAFF uniquement", async () => {
  const a = await seedTenant("ntf");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "x@y.z" });
  const ownerRows = await prisma.notification.findMany({ where: { userId: a.owner.id } });
  const staffRows = await prisma.notification.findMany({ where: { userId: a.staff.id } });
  assert.equal(ownerRows.length, 1);
  assert.equal(staffRows.length, 0);
});

test("create best-effort : tenant sans destinataire non-STAFF → no-op, ne lève pas", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "empty", displayName: "Empty" } });
  await prisma.user.create({ data: { tenantId: tenant.id, email: "s@empty.africa", passwordHash: "x", role: "ORGANIZER_STAFF" } });
  await service.create(tenant.id, "EVENT_ACTIVATED", { eventId: "e", title: "T" });
  const rows = await prisma.notification.findMany({ where: { tenantId: tenant.id } });
  assert.equal(rows.length, 0);
});

test("list + unreadCount scopés à l'utilisateur", async () => {
  const a = await seedTenant("scope");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "x@y.z" });
  const owner = asUser(a.owner, "ORGANIZER_OWNER");
  const { items } = await service.list(owner, { limit: 20 });
  assert.equal(items.length, 1);
  const { count } = await service.unreadCount(owner);
  assert.equal(count, 1);
  // le STAFF n'a rien
  const { count: staffCount } = await service.unreadCount(asUser(a.staff, "ORGANIZER_STAFF"));
  assert.equal(staffCount, 0);
});

test("markRead marque la sienne ; celle d'autrui → NotFound", async () => {
  const a = await seedTenant("read");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "x@y.z" });
  const ownerRow = await prisma.notification.findFirstOrThrow({ where: { userId: a.owner.id } });
  await service.markRead(asUser(a.owner, "ORGANIZER_OWNER"), ownerRow.id);
  const after = await prisma.notification.findUniqueOrThrow({ where: { id: ownerRow.id } });
  assert.ok(after.readAt);
  // un autre user ne peut pas marquer cette notif
  await assert.rejects(service.markRead(asUser(a.staff, "ORGANIZER_STAFF"), ownerRow.id), /introuvable|not found|404/i);
});

test("createForPlatformAdmins notifie les admins plateforme", async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "adm-ntf", displayName: "Admin Org" } });
  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@platform.africa",
      passwordHash: "x",
      role: "PLATFORM_ADMIN"
    }
  });
  await prisma.user.create({
    data: { tenantId: tenant.id, email: "owner@org.africa", passwordHash: "x", role: "ORGANIZER_OWNER" }
  });
  await service.createForPlatformAdmins("PARTNER_REQUEST_RECEIVED", {
    eventTitle: "Gala",
    requestId: "req-1"
  });
  const rows = await prisma.notification.findMany({ where: { userId: adminUser.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.type, "PARTNER_REQUEST_RECEIVED");
});

test("markAllRead passe toutes les non-lues du user à lues", async () => {
  const a = await seedTenant("allread");
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "1@y.z" });
  await service.create(a.tenant.id, "INVITATION_ACCEPTED", { email: "2@y.z" });
  const { updated } = await service.markAllRead(asUser(a.owner, "ORGANIZER_OWNER"));
  assert.equal(updated, 2);
  const { count } = await service.unreadCount(asUser(a.owner, "ORGANIZER_OWNER"));
  assert.equal(count, 0);
});
