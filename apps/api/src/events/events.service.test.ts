import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EventsService } from "./events.service";
import { VotesService } from "../votes/votes.service";
import { PlatformControlService } from "../platform-control/platform-control.service";
import { VaultService } from "../platform-control/vault.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PartnersService } from "../partners/partners.service";
import { noopPartnerNotifications } from "../partners/partner-notifications.stub";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const votes = new VotesService(prismaService);
const partners = new PartnersService(prismaService, noopPartnerNotifications());
const events = new EventsService(prismaService, votes, new NotificationsService(prismaService), partners);
const platform = new PlatformControlService(prismaService, new VaultService(prismaService));

function owner(tenantId: string) {
  return { userId: "owner-1", tenantId, email: "owner@ev.bj", role: UserRole.ORGANIZER_OWNER };
}
function admin(tenantId: string) {
  return { userId: "admin-1", tenantId, email: "admin@ev.bj", role: UserRole.PLATFORM_ADMIN };
}
const past = () => new Date(Date.now() - 86_400_000).toISOString();
const future = () => new Date(Date.now() + 86_400_000).toISOString();

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function tenant(slug = "ev-test") {
  return prisma.tenant.create({ data: { slug, displayName: slug } });
}

test("createEvent: slug normalisé en minuscules + statut DRAFT", async () => {
  const t = await tenant();
  const ev = await events.createEvent(owner(t.id), {
    slug: "MiXeD-Case",
    title: "Mon Concours",
    startsAt: past(),
    endsAt: future()
  });
  assert.equal(ev.slug, "mixed-case");
  assert.equal(ev.status, EventStatus.DRAFT);
});

test("createEvent: layout par défaut GRID, et layout choisi persisté + exposé en public", async () => {
  const t = await tenant("ev-layout");
  const def = await events.createEvent(owner(t.id), {
    slug: "layout-default",
    title: "Layout Default",
    startsAt: past(),
    endsAt: future()
  });
  assert.equal(def.layout, "GRID");

  const spot = await events.createEvent(owner(t.id), {
    slug: "layout-spotlight",
    title: "Layout Spotlight",
    startsAt: past(),
    endsAt: future(),
    layout: "SPOTLIGHT"
  });
  assert.equal(spot.layout, "SPOTLIGHT");

  // Le contrat public (GET /votes/public/event/:slug) expose le layout.
  const pub = await votes.getPublicEventBySlug("layout-spotlight");
  assert.equal(pub.event.layout, "SPOTLIGHT");
});

test("createEvent: rejette endsAt <= startsAt", async () => {
  const t = await tenant();
  await assert.rejects(
    events.createEvent(owner(t.id), { slug: "bad-dates", title: "Dates KO", startsAt: future(), endsAt: past() }),
    /endsAt/
  );
});

test("createEvent: slug GLOBALEMENT unique → 409 même entre tenants", async () => {
  const t1 = await tenant("ev-one");
  const t2 = await tenant("ev-two");
  await events.createEvent(owner(t1.id), { slug: "dup-slug", title: "Premier", startsAt: past(), endsAt: future() });
  await assert.rejects(
    events.createEvent(owner(t2.id), { slug: "dup-slug", title: "Second", startsAt: past(), endsAt: future() }),
    /déjà utilisé/
  );
});

test("listCandidates: isolation tenant (event d'autrui → introuvable)", async () => {
  const t1 = await tenant("ev-iso-a");
  const t2 = await tenant("ev-iso-b");
  const ev = await events.createEvent(owner(t1.id), { slug: "iso-evt", title: "Iso", startsAt: past(), endsAt: future() });
  await assert.rejects(events.listCandidates(owner(t2.id), ev.id), /introuvable/);
});

test("updateEvent: activation refusée (402) tant que le forfait est impayé", async () => {
  const t = await tenant("ev-act");
  await platform.updateSettings(admin(t.id), { activationFeeCfa: 20000 });
  const ev = await events.createEvent(owner(t.id), { slug: "act-evt", title: "Activation", startsAt: past(), endsAt: future() });
  await assert.rejects(events.updateEvent(owner(t.id), ev.id, { status: "ACTIVE" }), /Forfait/);
});

test("importCandidates: crée plusieurs candidats et signale les numéros en conflit", async () => {
  const t = await tenant("ev-bulk");
  const ev = await events.createEvent(owner(t.id), { slug: "bulk-evt", title: "Bulk", startsAt: past(), endsAt: future() });
  await events.createCandidate(owner(t.id), ev.id, { fullName: "Existant", number: 1 });

  const result = await events.importCandidates(owner(t.id), ev.id, {
    candidates: [
      { fullName: "Arielle", number: 2 },
      { fullName: "Brice", number: 1 },
      { fullName: "Chloé", number: 3 }
    ]
  });

  assert.equal(result.createdCount, 2);
  assert.equal(result.errorCount, 1);
  assert.equal(result.errors[0]?.number, 1);

  const list = await events.listCandidates(owner(t.id), ev.id);
  assert.equal(list.length, 3);
});
