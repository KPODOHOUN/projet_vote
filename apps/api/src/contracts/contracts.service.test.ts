import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { ContractStatus, EventStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { AuthService } from "../auth/auth.service";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { assertEventTransition } from "../events/event-lifecycle";
import { ContractsService } from "./contracts.service";

const prismaService = new PrismaService();
const notifications = new NotificationsService(prismaService);
// Aucun email ne part en test : hors production, le code de signature est renvoyé.
const auth = new AuthService(prismaService, notifications, { send: async () => false } as unknown as MailService);
const contracts = new ContractsService(prismaService, new OfferSettingsService(prismaService), auth, notifications);
const meta = { ip: "203.0.113.7", userAgent: "test-agent" };

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

/** Petite image PNG valide (signature tracée simulée). */
function signaturePng(): string {
  const width = 60;
  const height = 20;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = y * (width * 4 + 1) + 1 + x * 4;
      const ink = Math.abs(y - 10 - Math.round(6 * Math.sin(x / 6))) < 2;
      raw[o] = ink ? 17 : 255;
      raw[o + 1] = ink ? 24 : 255;
      raw[o + 2] = ink ? 39 : 255;
      raw[o + 3] = 255;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const identity = {
  firstName: "Awa",
  lastName: "Kouassi",
  phone: "0197000001",
  address: "Lot 12, Cotonou",
  idDocumentType: "Carte nationale d'identité",
  idDocumentNumber: "CI-123456",
  organizationName: "Miss Campus"
};

async function seed(opts: { price?: number | null; candidates?: number } = {}) {
  const tenant = await prisma.tenant.create({ data: { slug: `ctr-${Math.random().toString(36).slice(2, 8)}`, displayName: "Org" } });
  const owner = await prisma.user.create({
    data: { tenantId: tenant.id, email: `owner-${tenant.id}@test.bj`, role: UserRole.ORGANIZER_OWNER, firstName: "Awa", lastName: "Kouassi" }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: `ev-${Math.random().toString(36).slice(2, 8)}`,
      title: "Miss Campus 2027",
      status: EventStatus.DRAFT,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 7 * 86_400_000),
      voteUnitPriceCfa: opts.price === undefined ? 200 : opts.price
    }
  });
  for (let i = 0; i < (opts.candidates ?? 1); i += 1) {
    await prisma.candidate.create({ data: { eventId: event.id, fullName: `Candidate ${i}`, publicRef: `ref-${event.id}-${i}` } });
  }
  const user = { userId: owner.id, tenantId: tenant.id, email: owner.email, role: UserRole.ORGANIZER_OWNER };
  return { tenant, event, user };
}

async function generateAndCode(ctx: Awaited<ReturnType<typeof seed>>) {
  const contract = await contracts.generate(ctx.user, ctx.event.id, identity);
  const { devCode } = await contracts.sendSignatureCode(ctx.user, ctx.event.id, contract.id);
  assert.ok(devCode, "code de test renvoyé hors production");
  return { contract, code: devCode };
}

const signPayload = (contentHash: string, code: string) => ({
  contentHash,
  signerName: "awa  KOUASSI",
  accept: true,
  code,
  signatureImage: signaturePng()
});

test("parcours complet : générer, lire, signer → contrat signé, concours publié, taux et réserve figés", async () => {
  const ctx = await seed();
  const overview = await contracts.getOverview(ctx.user, ctx.event.id);
  assert.deepEqual(overview.requirements, []);
  assert.equal(overview.current, null);

  const { contract, code } = await generateAndCode(ctx);
  assert.equal(contract.status, ContractStatus.PENDING_SIGNATURE);
  assert.match(contract.document.sections.map((s) => s.paragraphs.join(" ")).join(" "), /12 %/);
  const stored = await prisma.eventContract.findUniqueOrThrow({ where: { id: contract.id } });
  assert.equal(stored.contentHash, createHash("sha256").update(stored.contentText).digest("hex"), "empreinte du texte figé");

  const result = await contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta);
  assert.equal(result.eventStatus, EventStatus.ACTIVE);

  const signed = await prisma.eventContract.findUniqueOrThrow({ where: { id: contract.id } });
  assert.equal(signed.status, ContractStatus.SIGNED);
  assert.equal(signed.signerName, "Awa Kouassi");
  assert.equal(signed.signerIp, meta.ip);
  assert.ok(signed.otpVerifiedAt && signed.signedAt);
  assert.ok(signed.signedPdf && Buffer.from(signed.signedPdf).subarray(0, 5).toString() === "%PDF-");
  assert.equal(signed.signedPdfSha256, createHash("sha256").update(signed.signedPdf!).digest("hex"));

  const event = await prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id } });
  assert.equal(event.status, EventStatus.ACTIVE);
  assert.equal(event.commissionBps, 1_200);
  assert.equal(event.heldBps, 5_000);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "contract.signed", targetId: contract.id } }));
  const notified = await prisma.notification.findMany({ where: { tenantId: ctx.event.tenantId }, select: { type: true } });
  const types = notified.map((n) => n.type).sort();
  assert.deepEqual(types, ["CONTRACT_SIGNED", "EVENT_ACTIVATED"]);
});

test("PDF signé : téléchargeable autant de fois que voulu, toujours l'original à l'identique", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  await contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta);
  const first = await contracts.getPdf(ctx.user, ctx.event.id, contract.id);
  const second = await contracts.getPdf(ctx.user, ctx.event.id, contract.id);
  const stored = await prisma.eventContract.findUniqueOrThrow({ where: { id: contract.id } });
  assert.ok(first.bytes.equals(second.bytes));
  assert.ok(first.bytes.equals(Buffer.from(stored.signedPdf!)));
  assert.match(first.filename, /-signe\.pdf$/);
});

test("prérequis : pas de contrat sans prix du vote ni candidat", async () => {
  const noPrice = await seed({ price: null });
  await assert.rejects(contracts.generate(noPrice.user, noPrice.event.id, identity), /prix du vote/);
  const noCandidate = await seed({ candidates: 0 });
  await assert.rejects(contracts.generate(noCandidate.user, noCandidate.event.id, identity), /au moins un candidat/);
});

test("autorisations : un membre d'équipe ne signe pas, un autre organisateur ne voit rien", async () => {
  const ctx = await seed();
  const staff = { ...ctx.user, userId: "staff-1", role: UserRole.ORGANIZER_STAFF };
  await assert.rejects(contracts.generate(staff, ctx.event.id, identity), /titulaire du compte/);
  const { contract } = await generateAndCode(ctx);
  const other = await seed();
  await assert.rejects(contracts.getPdf(other.user, ctx.event.id, contract.id), /introuvable/);
  await assert.rejects(contracts.sign(other.user, ctx.event.id, contract.id, signPayload(contract.contentHash, "000000"), meta), /introuvable/);
});

test("contenu présenté différent du contenu à signer → refus, rien n'est publié", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  await assert.rejects(contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload("a".repeat(64), code), meta), /ne correspond pas/);
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id } })).status, EventStatus.DRAFT);
});

test("concours modifié après la génération (prix) → contrat remplacé, nouvelle signature exigée", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  await prisma.event.update({ where: { id: ctx.event.id }, data: { voteUnitPriceCfa: 300 } });
  await assert.rejects(contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta), /ont changé/);
  assert.equal((await prisma.eventContract.findUniqueOrThrow({ where: { id: contract.id } })).status, ContractStatus.SUPERSEDED);
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id } })).status, EventStatus.DRAFT);
  // Une nouvelle version, relue et signée, publie le concours.
  const again = await generateAndCode(ctx);
  assert.match(again.contract.document.sections[1]!.paragraphs.join(" "), /300 F CFA/);
  await contracts.sign(ctx.user, ctx.event.id, again.contract.id, signPayload(again.contract.contentHash, again.code), meta);
  assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id } })).status, EventStatus.ACTIVE);
});

test("mauvais code ou nom différent du contrat → refus, contrat toujours à signer", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  const wrong = code === "000000" ? "111111" : "000000";
  await assert.rejects(contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, wrong), meta), /Code invalide/);
  await assert.rejects(
    contracts.sign(ctx.user, ctx.event.id, contract.id, { ...signPayload(contract.contentHash, code), signerName: "Quelqu'un d'autre" }, meta),
    /tel qu'il figure au contrat/
  );
  assert.equal((await prisma.eventContract.findUniqueOrThrow({ where: { id: contract.id } })).status, ContractStatus.PENDING_SIGNATURE);
});

test("double soumission : une seule signature aboutit", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  const results = await Promise.allSettled([
    contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta),
    contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await prisma.eventContract.count({ where: { eventId: ctx.event.id, status: ContractStatus.SIGNED } }), 1);
});

test("contrat signé : plus de régénération, et la publication ne passe que par le contrat", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  await contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta);
  await assert.rejects(contracts.generate(ctx.user, ctx.event.id, identity), /déjà publié/);
  await assert.rejects(contracts.sign(ctx.user, ctx.event.id, contract.id, signPayload(contract.contentHash, code), meta), /déjà signé/);
  assert.throws(() => assertEventTransition(EventStatus.DRAFT, EventStatus.ACTIVE, "update"), /signez son contrat/);
  assert.throws(() => assertEventTransition(EventStatus.ACTIVE, EventStatus.DRAFT, "update"), /ne peut pas revenir en brouillon/);
});

test("administration : téléchargement d'un contrat journalisé", async () => {
  const ctx = await seed();
  const { contract } = await generateAndCode(ctx);
  const admin = { userId: "admin-1", tenantId: ctx.tenant.id, email: "admin@test.bj", role: UserRole.PLATFORM_ADMIN };
  const file = await contracts.adminPdf(admin, contract.id);
  assert.equal(file.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "contract.downloaded_by_admin", targetId: contract.id } }));
});

test("signature sans dessin : case, nom et code email suffisent ; le PDF porte la mention et la clause de preuve", async () => {
  const ctx = await seed();
  const { contract, code } = await generateAndCode(ctx);
  const { signatureImage: _drawn, ...payload } = signPayload(contract.contentHash, code);
  await contracts.sign(ctx.user, ctx.event.id, contract.id, payload, meta);
  const signed = await prisma.eventContract.findUniqueOrThrow({ where: { id: contract.id } });
  assert.equal(signed.status, ContractStatus.SIGNED);
  assert.equal(signed.signatureImage, null);
  assert.match(signed.contentText, /Code du numérique/);
  assert.match(signed.contentText, /font foi entre les parties/);
});
