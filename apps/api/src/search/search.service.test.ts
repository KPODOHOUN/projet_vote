import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { SearchService } from "./search.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { candidateTestData } from "../test-utils/candidate-fixture";
import type { AuthUser } from "../auth/auth.types";

const prismaService = new PrismaService();
const searchService = new SearchService(prismaService);

async function seedTenant(slug: string) {
  const tenant = await prisma.tenant.create({ data: { slug, displayName: `T-${slug}` } });
  const owner = await prisma.user.create({ data: { tenantId: tenant.id, email: `owner@${slug}.africa`, passwordHash: "x", role: "ORGANIZER_OWNER" } });
  const event = await prisma.event.create({ data: { tenantId: tenant.id, slug: `${slug}-finale`, title: "Grande Finale", startsAt: new Date(), endsAt: new Date(Date.now() + 1e9) } });
  await prisma.candidate.create({ data: candidateTestData(event.id, { fullName: "Awa Diop", number: 1 }) });
  await prisma.paymentTransaction.create({ data: { tenantId: tenant.id, eventId: event.id, provider: "FEEXPAY", amountCfa: 500, providerRef: `REF-${slug}-XYZ`, idempotencyKey: `idem-${slug}-1` } });
  return { tenant, owner, event };
}

function ownerUser(tenantId: string, userId: string): AuthUser {
  return { userId, tenantId, role: "ORGANIZER_OWNER", email: "owner@x" };
}
function staffUser(tenantId: string): AuthUser {
  return { userId: "staff", tenantId, role: "ORGANIZER_STAFF", email: "staff@x" };
}

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("isolation tenant : un user ne voit jamais les données d'un autre tenant", async () => {
  const a = await seedTenant("aaa");
  await seedTenant("bbb");
  const res = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "Finale" });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0]?.slug, "aaa-finale");
  // le candidat/paiement du tenant B n'apparaissent pas
  const cand = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "Awa" });
  assert.equal(cand.candidates.length, 1);
  assert.equal(cand.candidates[0]?.eventId, a.event.id);
  const pay = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "REF-" });
  assert.ok(pay.payments.every((p) => p.eventId === a.event.id));
});

test("gating rôle : STAFF ne reçoit ni membres ni paiements", async () => {
  const a = await seedTenant("ccc");
  const owner = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "owner@" });
  assert.ok(owner.members.length >= 1);
  const staff = await searchService.search(staffUser(a.tenant.id), { q: "owner@" });
  assert.equal(staff.members.length, 0);
  const staffPay = await searchService.search(staffUser(a.tenant.id), { q: "REF-" });
  assert.equal(staffPay.payments.length, 0);
});

test("ILIKE insensible à la casse", async () => {
  const a = await seedTenant("ddd");
  const res = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "fin" });
  assert.equal(res.events.length, 1);
});

test("q court (< 2) → tout vide", async () => {
  const a = await seedTenant("eee");
  const res = await searchService.search(ownerUser(a.tenant.id, a.owner.id), { q: "a" });
  assert.deepEqual([res.events, res.candidates, res.members, res.payments], [[], [], [], []]);
});
