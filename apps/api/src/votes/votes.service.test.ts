import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VotesService } from "./votes.service";
import { EventsService } from "../events/events.service";
import { generatePublicRef } from "../common/public-ref";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const votes = new VotesService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

type EventOverrides = {
  status?: EventStatus;
  startsAt?: Date;
  endsAt?: Date;
  voteUnitPriceCfa?: number;
};

async function seed(overrides: EventOverrides = {}) {
  const tenant = await prisma.tenant.create({ data: { slug: "vote-test", displayName: "Vote Test" } });
  const now = Date.now();
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: "vote-evt",
      title: "Vote Evt",
      status: overrides.status ?? EventStatus.ACTIVE,
      startsAt: overrides.startsAt ?? new Date(now - 86_400_000),
      endsAt: overrides.endsAt ?? new Date(now + 86_400_000),
      voteUnitPriceCfa: overrides.voteUnitPriceCfa ?? 100
    }
  });
  const candidate = await prisma.candidate.create({
    data: {
      eventId: event.id,
      fullName: "Cand 7",
      number: 7,
      publicRef: generatePublicRef()
    }
  });
  return { tenant, event, candidate };
}

const base = (over: Record<string, unknown> = {}) => ({
  tenantSlug: "vote-test",
  eventSlug: "vote-evt",
  candidateNumber: 7,
  quantity: 5,
  voterPhone: "22990000001",
  ...over
});

test("castVote: succès crée un vote NON payé (paidAt null)", async () => {
  await seed();
  const vote = await votes.castVote(base());
  const row = await prisma.vote.findUnique({ where: { id: vote.id } });
  assert.equal(row?.paidAt, null);
});

test("castVote: tenant ou évènement introuvable", async () => {
  await seed();
  await assert.rejects(votes.castVote(base({ tenantSlug: "nope-tenant" })), /Tenant introuvable/);
  await assert.rejects(votes.castVote(base({ eventSlug: "nope-event" })), /Évènement introuvable/);
});

test("castVote: refuse si l'évènement n'est pas ACTIVE", async () => {
  await seed({ status: EventStatus.DRAFT });
  await assert.rejects(votes.castVote(base()), /n'est pas ouvert/);
});

test("castVote: refuse hors période de vote", async () => {
  const future = Date.now() + 86_400_000;
  await seed({ startsAt: new Date(future), endsAt: new Date(future + 86_400_000) });
  await assert.rejects(votes.castVote(base()), /hors période/);
});

test("castVote: refuse si l'évènement n'a pas de prix unitaire défini", async () => {
  await seed({ voteUnitPriceCfa: 0 });
  await assert.rejects(votes.castVote(base()), /pas de prix unitaire/);
});

test("castVote: refuse un candidat inexistant", async () => {
  await seed();
  await assert.rejects(votes.castVote(base({ candidateNumber: 999 })), /Candidat introuvable/);
});

test("getPublicEventBySlug: renvoie branding + candidats, 404 sinon", async () => {
  await seed();
  const payload = await votes.getPublicEventBySlug("vote-evt");
  assert.equal(payload.organizer.slug, "vote-test");
  assert.equal(payload.candidates.length, 1);
  await assert.rejects(votes.getPublicEventBySlug("absent"), /introuvable/);
});

test("getPublicEventBySlug: expose photoUrl + voteCount PAID-only par candidat", async () => {
  const { event, candidate } = await seed();
  await prisma.candidate.update({ where: { id: candidate.id }, data: { photoUrl: "https://img.test/c7.jpg" } });
  // un vote NON payé ne compte pas
  await prisma.vote.create({
    data: { tenantId: event.tenantId, eventId: event.id, candidateId: candidate.id, amountCfa: 500 }
  });
  // un vote payé compte
  await prisma.vote.create({
    data: { tenantId: event.tenantId, eventId: event.id, candidateId: candidate.id, amountCfa: 500, paidAt: new Date() }
  });

  const payload = await votes.getPublicEventBySlug("vote-evt");
  const c = payload.candidates.find((x) => x.number === 7)!;
  assert.equal(c.photoUrl, "https://img.test/c7.jpg");
  assert.equal(c.voteCount, 1);
});

test("getPublicEventResults: expose branding (event > tenant) + 404 si absent", async () => {
  const { tenant, event } = await seed();
  // Le tenant porte une couleur par défaut, l'évènement la surcharge.
  await prisma.tenant.update({ where: { id: tenant.id }, data: { brandColor: "#111111", logoUrl: "https://img.test/org.png" } });
  await prisma.event.update({ where: { id: event.id }, data: { brandColor: "#DB2777", tagline: "En direct" } });

  const payload = await votes.getPublicEventResults("vote-evt");
  assert.equal(payload.event.slug, "vote-evt");
  assert.equal(payload.event.branding.brandColor, "#DB2777"); // event gagne
  assert.equal(payload.event.branding.logoUrl, "https://img.test/org.png"); // hérité du tenant
  assert.equal(payload.event.branding.tagline, "En direct");
  assert.ok(Array.isArray(payload.results));

  await assert.rejects(votes.getPublicEventResults("absent"), /introuvable/);
});

test("getPublicEventResults: n'expose JAMAIS l'argent (votes only)", async () => {
  const { event, candidate } = await seed();
  // Un vote PAYÉ de 500 : il compte dans le tally public...
  await prisma.vote.create({
    data: {
      tenantId: event.tenantId,
      eventId: event.id,
      candidateId: candidate.id,
      amountCfa: 500,
      paidAt: new Date()
    }
  });

  const payload = await votes.getPublicEventResults("vote-evt");
  // ...mais le montant encaissé ne doit apparaître nulle part côté public.
  assert.equal(payload.totals.votes, 1);
  assert.equal("amountCfa" in payload.totals, false);
  assert.ok(payload.results.length >= 1);
  for (const row of payload.results) {
    assert.equal("totalAmountCfa" in row, false);
  }
});

test("castVote: accepte candidatePublicRef", async () => {
  const { candidate } = await seed();
  const vote = await votes.castVote({
    tenantSlug: "vote-test",
    eventSlug: "vote-evt",
    candidatePublicRef: candidate.publicRef,
    quantity: 3,
    voterPhone: "22990000001"
  });
  assert.ok(vote.id);
});

test("getPublicCandidate: renvoie le candidat (photo+voteCount), 404 si absent", async () => {
  const { event, candidate } = await seed();
  await prisma.candidate.update({ where: { id: candidate.id }, data: { photoUrl: "https://img.test/c7.jpg" } });
  await prisma.vote.create({
    data: { tenantId: event.tenantId, eventId: event.id, candidateId: candidate.id, amountCfa: 500, paidAt: new Date() }
  });

  const payload = await votes.getPublicCandidate("vote-evt", candidate.publicRef);
  assert.equal(payload.candidate.fullName, "Cand 7");
  assert.equal(payload.candidate.publicRef, candidate.publicRef);
  assert.equal(payload.candidate.photoUrl, "https://img.test/c7.jpg");
  assert.equal(payload.candidate.voteCount, 1);
  assert.equal(payload.event.slug, "vote-evt");

  await assert.rejects(votes.getPublicCandidate("vote-evt", "999"), /introuvable/);
  await assert.rejects(votes.getPublicCandidate("absent", candidate.publicRef), /introuvable/);
});

test("updateCandidate: met à jour photoUrl, refuse hors tenant", async () => {
  const { tenant, event, candidate } = await seed();
  const events = new EventsService(prismaService, votes, undefined as never, undefined as never);
  const owner = { userId: "u1", tenantId: tenant.id, role: "ORGANIZER_OWNER" } as never;
  await events.updateCandidate(owner, event.id, candidate.id, { photoUrl: "https://img.test/new.jpg" });
  const row = await prisma.candidate.findUnique({ where: { id: candidate.id } });
  assert.equal(row?.photoUrl, "https://img.test/new.jpg");

  const intruder = { userId: "u2", tenantId: "other-tenant", role: "ORGANIZER_OWNER" } as never;
  await assert.rejects(
    events.updateCandidate(intruder, event.id, candidate.id, { photoUrl: "https://x.test/y.jpg" }),
    /introuvable/
  );
});

test("listPublicEvents: liste les events d'un tenant, 404 si tenant inconnu", async () => {
  await seed();
  const list = await votes.listPublicEvents("vote-test");
  assert.equal(list.length, 1);
  await assert.rejects(votes.listPublicEvents("absent"), /introuvable/);
});
