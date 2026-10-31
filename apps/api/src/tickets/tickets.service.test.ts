import "reflect-metadata";
import { test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider, UserRole } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { NotificationsService } from "../notifications/notifications.service";
import { OfferSettingsService } from "../offers/offer-settings.service";
import { WalletService } from "../offers/wallet.service";
import { PaymentVerifyService } from "../payments/payment-verify.service";
import type { PaymentsService } from "../payments/payments.service";
import type { PspRegistry } from "../payments/psp/psp.registry";
import { TicketsService } from "./tickets.service";

const prismaService = new PrismaService();
const verify = new PaymentVerifyService(
  prismaService,
  new NotificationsService(prismaService),
  {} as PspRegistry,
  new WalletService(prismaService),
  new OfferSettingsService(prismaService)
);

// Doublure du circuit de paiement : enregistre l'appel, échoue sur demande.
const paymentCalls: Array<{ transactionId: string; amountCfa: number; payerPhone: string }> = [];
let failNextPayment = false;
const payments = {
  async startTicketPayment(args: { transactionId: string; amountCfa: number; payerPhone: string }) {
    paymentCalls.push(args);
    if (failNextPayment) {
      failNextPayment = false;
      throw new Error("PSP indisponible");
    }
    return { status: "PENDING", statusToken: "jeton" };
  },
  async refreshTicketPayment(transactionId: string) {
    const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
    return { transactionId, status: tx!.status };
  }
} as unknown as PaymentsService;
const psp = { resolveProvider: async () => PaymentProvider.FEEXPAY } as unknown as PspRegistry;

const tickets = new TicketsService(prismaService, new MailService(), payments, psp);
const buyer = { holderPhone: "+22997000001" };
const organizer = (tenantId: string) => ({ userId: `owner-${tenantId}`, tenantId, email: "owner@tix.bj", role: UserRole.ORGANIZER_OWNER });

before(async () => {
  assertTestDatabase();
  await resetDatabase();
});

after(async () => {
  await prisma.$disconnect();
});

async function seedTicketType() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const tenant = await prisma.tenant.create({ data: { slug: `tix-${suffix}`, displayName: "Tix" } });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      title: "Gala",
      slug: `gala-${suffix}`,
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const ticketType = await prisma.ticketType.create({
    data: { eventId: event.id, name: "Standard", priceCfa: 2_000, quantity: 50 }
  });
  return { event, ticketType };
}

test("purchaseTickets: billets réservés, liés à un paiement TICKET en attente, paiement lancé sur le bon numéro", async () => {
  const { event, ticketType } = await seedTicketType();
  const result = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer });
  const tx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: result.transaction.id } });
  assert.equal(tx.purpose, "TICKET");
  assert.equal(tx.status, "PENDING");
  assert.equal(tx.amountCfa, 4_000);
  const rows = await prisma.ticket.findMany({ where: { eventId: event.id } });
  assert.deepEqual(rows.map((r) => [r.status, r.paymentTransactionId]), [["RESERVED", tx.id], ["RESERVED", tx.id]]);
  const call = paymentCalls.at(-1)!;
  assert.equal(call.transactionId, tx.id);
  assert.equal(call.payerPhone, buyer.holderPhone);
  assert.equal(result.transaction.statusToken, "jeton");
});

test("confirmation : un paiement ne valide QUE ses billets, pas ceux d'un autre acheteur", async () => {
  const { event, ticketType } = await seedTicketType();
  const a = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 1, ...buyer });
  const b = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 1, ...buyer });
  await prisma.paymentTransaction.update({ where: { id: a.transaction.id }, data: { providerRef: `demo_${a.transaction.id}` } });
  await verify.applyDemoSuccess(a.transaction.id);
  const ticketA = await prisma.ticket.findUniqueOrThrow({ where: { id: a.tickets[0]!.id } });
  const ticketB = await prisma.ticket.findUniqueOrThrow({ where: { id: b.tickets[0]!.id } });
  assert.equal(ticketA.status, "PAID");
  assert.equal(ticketB.status, "RESERVED");
});

test("confirmation ESCROW : la recette des billets arrive au portefeuille de l'organisateur", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.organizerWallet.create({ data: { tenantId: event.tenantId } });
  const r = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer });
  await prisma.paymentTransaction.update({ where: { id: r.transaction.id }, data: { providerRef: `demo_${r.transaction.id}` } });
  await verify.applyDemoSuccess(r.transaction.id);
  const entries = await prisma.walletLedgerEntry.findMany({ where: { eventId: event.id } });
  const credited = entries.reduce((sum, e) => sum + Math.max(0, e.amountCfa), 0);
  assert.ok(credited > 0, "aucune écriture de recette au portefeuille");
  assert.ok(credited <= 4_000);
});

test("purchaseTickets: la limite par achat (maxPerPerson) est appliquée", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { maxPerPerson: 2 } });
  await assert.rejects(
    tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 3, ...buyer }),
    /Maximum 2 ticket/
  );
  assert.equal(await prisma.ticket.count({ where: { eventId: event.id } }), 0);
});

test("purchaseTickets: des achats simultanés ne dépassent jamais le stock", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { quantity: 5, maxPerPerson: 10 } });
  const results = await Promise.allSettled(
    [1, 2, 3].map(() => tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer }))
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(await prisma.ticket.count({ where: { ticketTypeId: ticketType.id } }), 4);
});

test("purchaseTickets: une réservation en attente garde le stock même ancienne, un paiement échoué le libère", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { quantity: 2, maxPerPerson: 10 } });
  const pending = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer });

  // Paiement toujours en attente, même après 16 min : le stock n'est pas revendu
  // (un paiement confirmé en retard ne doit jamais dépasser la jauge).
  await prisma.ticket.updateMany({ where: { paymentTransactionId: pending.transaction.id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });
  await assert.rejects(tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 1, ...buyer }), /disponible/);

  // Le paiement aboutit : billets payés, jauge respectée.
  await prisma.paymentTransaction.update({ where: { id: pending.transaction.id }, data: { providerRef: `demo_${pending.transaction.id}` } });
  await verify.applyDemoSuccess(pending.transaction.id);
  assert.equal(await prisma.ticket.count({ where: { ticketTypeId: ticketType.id, status: { in: ["PAID", "RESERVED"] } } }), 2);
});

test("purchaseTickets: un paiement échoué libère aussitôt ses billets pour un autre acheteur", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { quantity: 2, maxPerPerson: 10 } });
  const first = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer });
  await prisma.$transaction([
    prisma.paymentTransaction.update({ where: { id: first.transaction.id }, data: { status: "FAILED" } }),
    prisma.ticket.updateMany({ where: { paymentTransactionId: first.transaction.id }, data: { status: "CANCELLED" } })
  ]);
  const second = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer });
  assert.equal(second.tickets.length, 2);
});

test("purchaseTickets: prestataire indisponible → paiement échoué et stock libéré", async () => {
  const { event, ticketType } = await seedTicketType();
  failNextPayment = true;
  await assert.rejects(
    tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, ...buyer }),
    /PSP indisponible/
  );
  const rows = await prisma.ticket.findMany({ where: { eventId: event.id } });
  assert.deepEqual(rows.map((r) => r.status), ["CANCELLED", "CANCELLED"]);
  const tx = await prisma.paymentTransaction.findFirstOrThrow({ where: { eventId: event.id } });
  assert.equal(tx.status, "FAILED");
});

test("getPublicTicket: le billet ne se lit qu'avec son secret", async () => {
  const { event, ticketType } = await seedTicketType();
  const r = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 1, ...buyer });
  const { id, qrSecret } = r.tickets[0]!;
  await assert.rejects(tickets.getPublicTicket(id, undefined), /introuvable/);
  await assert.rejects(tickets.getPublicTicket(id, "mauvais-secret"), /introuvable/);
  const ok = await tickets.getPublicTicket(id, qrSecret);
  assert.equal(ok.id, id);
});

test("validateTicket: un billet non payé est refusé au scan", async () => {
  const { event, ticketType } = await seedTicketType();
  const ticket = await prisma.ticket.create({
    data: {
      ticketTypeId: ticketType.id,
      eventId: event.id,
      qrSecret: "secret-reserved",
      status: "RESERVED",
      amountCfa: ticketType.priceCfa
    }
  });
  await assert.rejects(
    tickets.validateTicket(organizer(event.tenantId), { ticketId: ticket.id, secret: "secret-reserved" }),
    /pas encore été payé/
  );
  const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(after.status, "RESERVED");
});

test("billetterie organisateur : un autre organisateur n'accède ni à l'événement ni à ses types de billets", async () => {
  const mine = await seedTicketType();
  const other = await seedTicketType();
  const me = organizer(mine.event.tenantId);
  await tickets.assertEventAccess(me, mine.event.id);
  await tickets.assertTicketTypeAccess(me, mine.event.id, mine.ticketType.id);
  await assert.rejects(tickets.assertEventAccess(me, other.event.id), /Événement introuvable/);
  // Type d'un autre événement passé sous mon événement : refusé aussi.
  await assert.rejects(tickets.assertTicketTypeAccess(me, mine.event.id, other.ticketType.id), /Type de ticket introuvable/);
  await assert.rejects(tickets.assertTicketTypeAccess(me, other.event.id, other.ticketType.id), /Événement introuvable/);
});

test("validateTicket : le billet d'un autre organisateur est introuvable, et il n'est pas consommé", async () => {
  const { event, ticketType } = await seedTicketType();
  const intruder = await seedTicketType();
  const ticket = await prisma.ticket.create({
    data: { ticketTypeId: ticketType.id, eventId: event.id, qrSecret: "secret-other", status: "PAID", amountCfa: ticketType.priceCfa }
  });
  await assert.rejects(
    tickets.validateTicket(organizer(intruder.event.tenantId), { ticketId: ticket.id, secret: "secret-other" }),
    /Billet inconnu de votre organisation/
  );
  assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "PAID");
});

test("validateTicket : deux scans simultanés du même billet → une seule entrée", async () => {
  const { event, ticketType } = await seedTicketType();
  const ticket = await prisma.ticket.create({
    data: { ticketTypeId: ticketType.id, eventId: event.id, qrSecret: "secret-twice", status: "PAID", amountCfa: ticketType.priceCfa }
  });
  const me = organizer(event.tenantId);
  const scans = await Promise.allSettled(
    Array.from({ length: 5 }, () => tickets.validateTicket(me, { ticketId: ticket.id, secret: "secret-twice" }))
  );
  assert.equal(scans.filter((scan) => scan.status === "fulfilled").length, 1);
  assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "USED");
});

test("concours publié : prix, nom et quantité d'un billet sont figés par le contrat, le reste se modifie", async () => {
  const { event, ticketType } = await seedTicketType();
  await assert.rejects(tickets.updateTicketType(event.id, ticketType.id, { priceCfa: 5_000 }), /fixés par le contrat signé.*le prix/);
  await assert.rejects(tickets.updateTicketType(event.id, ticketType.id, { quantity: ticketType.quantity + 50 }), /la quantité/);
  await assert.rejects(tickets.updateTicketType(event.id, ticketType.id, { name: "Autre" }), /le nom/);
  // Mêmes valeurs renvoyées par le formulaire, description et plafond par achat modifiés : accepté.
  const updated = await tickets.updateTicketType(event.id, ticketType.id, {
    priceCfa: ticketType.priceCfa,
    quantity: ticketType.quantity,
    description: "Entrée générale",
    maxPerPerson: 4
  });
  assert.equal(updated.description, "Entrée générale");
  assert.equal(updated.maxPerPerson, 4);

  // En brouillon (avant signature), tout reste libre.
  await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.DRAFT } });
  assert.equal((await tickets.updateTicketType(event.id, ticketType.id, { priceCfa: 5_000 })).priceCfa, 5_000);
});

test("concours publié : aucun nouveau type de billet ; un type hors contrat ne peut pas être mis en vente", async () => {
  const { event, ticketType } = await seedTicketType();
  await assert.rejects(
    tickets.createTicketType(event.id, { name: "VIP tardif", priceCfa: 10_000, quantity: 10 }),
    /aucun nouveau type/
  );
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { status: "PAUSED" } });
  await prisma.eventContract.create({
    data: {
      id: `ctr_tix_${event.id}`,
      eventId: event.id,
      tenantId: event.tenantId,
      templateVersion: "test",
      status: "SIGNED",
      signedAt: new Date(),
      snapshot: { event: { ticketTypes: [{ name: "Autre billet", priceCfa: 1_000, quantity: 10 }] } },
      contentText: "contrat",
      contentHash: "y".repeat(64)
    }
  });
  await assert.rejects(tickets.updateTicketType(event.id, ticketType.id, { status: "ACTIVE" }), /ne figure pas au contrat/);
  // Mettre en pause reste toujours possible.
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { status: "ACTIVE" } });
  assert.equal((await tickets.updateTicketType(event.id, ticketType.id, { status: "PAUSED" })).status, "PAUSED");
});

test("saveDesign : design valide enregistré ; URL javascript et CSS url() refusés", async () => {
  const { ticketType } = await seedTicketType();
  const design = {
    width: 600,
    height: 300,
    background: { type: "color", value: "#ffffff" },
    backgroundImage: "https://res.cloudinary.com/demo/fond.png",
    layers: [
      { id: "l1", type: "text", content: "Gala", x: 10, y: 10, width: 200, height: 40, zIndex: 1, visible: true, style: { color: "#111111", fontSize: 24 } }
    ]
  };
  await tickets.saveDesign(ticketType.id, design);
  await assert.rejects(tickets.saveDesign(ticketType.id, { ...design, backgroundImage: "javascript:alert(1)" }), /Design invalide/);
  await assert.rejects(
    tickets.saveDesign(ticketType.id, { ...design, background: { type: "color", value: "url(https://evil.example/x)" } }),
    /Design invalide/
  );
  await assert.rejects(tickets.saveDesign(ticketType.id, { foo: "bar" }), /Design invalide/);
});

test("listTickets: un filtre de statut inconnu est refusé proprement", async () => {
  const { event } = await seedTicketType();
  await assert.rejects(tickets.listTickets(event.id, { status: "nimporte" }), /Statut de billet inconnu/);
});

test("saveDesign : emplacement du QR code accepté, sans contenu", async () => {
  const { ticketType } = await seedTicketType();
  const qr = { id: "qr", type: "qr", content: "", x: 400, y: 50, width: 180, height: 180, zIndex: 2, visible: true, style: {} };
  const design = { width: 600, height: 300, background: { type: "color", value: "#111111" }, backgroundImage: null, layers: [qr] };
  await tickets.saveDesign(ticketType.id, design);
  await assert.rejects(tickets.saveDesign(ticketType.id, { ...design, layers: [{ ...qr, content: "https://evil.example" }] }), /Design invalide/);
  const stored = await tickets.getPublicTicket(
    (await prisma.ticket.create({ data: { ticketTypeId: ticketType.id, eventId: ticketType.eventId, qrSecret: "s-design", status: "PAID", amountCfa: 1000 } })).id,
    "s-design"
  );
  assert.equal((stored.ticketType.design as { layers: Array<{ type: string }> }).layers[0]!.type, "qr");
  assert.ok(stored.event.startsAt instanceof Date);
});

test("e-mail du billet : billet dessiné joint, saisies de l'acheteur échappées", async () => {
  const { ticketEmailHtml } = await import("./ticket-email.util");
  const html = ticketEmailHtml({
    id: "tkt_1", qrSecret: "sec/ret", amountCfa: 1000, holderName: "<img src=x onerror=alert(1)>",
    holderPhone: null, holderEmail: "a@b.c", ticketType: { name: "VIP & Co" }, event: { title: "Gala <2026>", slug: "gala" }
  });
  assert.ok(html.includes("/t/tkt_1/image?s=sec%2Fret"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("VIP &amp; Co") && html.includes("Gala &lt;2026&gt;"));
});

test("saveDesign : formes, polices et verrouillage acceptés ; police inconnue et forme avec contenu refusées", async () => {
  const { ticketType } = await seedTicketType();
  const shape = { id: "s", type: "shape", content: "", x: 0, y: 0, width: 200, height: 4, zIndex: 1, visible: true, locked: true,
    style: { shape: "line", stroke: "#ca8a04", strokeWidth: 3, fill: "transparent" } };
  const text = { id: "t", type: "text", content: "{{titulaire}}\nVIP", x: 10, y: 10, width: 300, height: 80, zIndex: 2, visible: true,
    style: { fontFamily: "playfair", letterSpacing: 2, lineHeight: 1.3, fontSize: 24 } };
  const design = { width: 1200, height: 500, background: { type: "gradient", value: "linear-gradient(135deg, #111827 0%, #312e81 100%)" }, backgroundImage: null, layers: [shape, text] };
  await tickets.saveDesign(ticketType.id, design);
  await assert.rejects(tickets.saveDesign(ticketType.id, { ...design, layers: [{ ...text, style: { fontFamily: "comic-sans" } }] }), /Design invalide/);
  await assert.rejects(tickets.saveDesign(ticketType.id, { ...design, layers: [{ ...shape, content: "x" }] }), /Design invalide/);
});

test("achat pour un groupe : chaque billet porte le nom de son invité, sinon celui de l'acheteur", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { maxPerPerson: 10 } });
  const r = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 3, holderName: "Koffi", guests: ["Awa", "", "  Yao "], ...buyer });
  const rows = await prisma.ticket.findMany({ where: { paymentTransactionId: r.transaction.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(rows.map((row) => row.holderName), ["Awa", "Koffi", "Yao"]);
});

test("limite par personne : comptée sur le numéro, tous achats confondus, quel que soit le format saisi", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { maxPerPerson: 3, quantity: 50 } });
  await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, holderPhone: "+22997000001" });
  await assert.rejects(
    tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, holderPhone: "0197000001" }),
    /peut encore en prendre 1/
  );
  await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 1, holderPhone: "0197000001" });
  await assert.rejects(tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 1, holderPhone: "97000001" }), /déjà atteint la limite/);
  // Un autre numéro n'est pas concerné.
  await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 3, holderPhone: "0196000002" });
});

test("un acheteur qui réessaie n'est pas bloqué par son propre achat non payé ; un autre acheteur ne peut pas le libérer", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { maxPerPerson: 2, quantity: 3 } });
  const first = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, holderPhone: "0197000021" });
  // L'invite USSD est partie (référence connue) mais l'acheteur l'a fermée.
  await prisma.paymentTransaction.update({ where: { id: first.transaction.id }, data: { providerRef: `ref_${first.transaction.id}` } });

  // Un autre numéro ne libère rien : il ne reste qu'une place pour lui.
  await assert.rejects(
    tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, holderPhone: "0196000022" }),
    /Seulement 1/
  );
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: first.transaction.id } })).status, "PENDING");

  // Le même acheteur réessaie : son ancienne tentative est remplacée.
  const retry = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, holderPhone: "+22997000021" });
  assert.equal(retry.tickets.length, 2);
  assert.equal((await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: first.transaction.id } })).status, "FAILED");
  assert.equal(await prisma.ticket.count({ where: { paymentTransactionId: first.transaction.id, status: "CANCELLED" } }), 2);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.abandoned_pending", targetId: first.transaction.id } });
  assert.equal((audit.metadata as { reason: string }).reason, "replaced_by_new_purchase");
});

test("numéros lisibles : attribués au paiement, à la suite, sans doublon même en parallèle", async () => {
  const { event, ticketType } = await seedTicketType();
  await prisma.ticketType.update({ where: { id: ticketType.id }, data: { maxPerPerson: 10, quantity: 50 } });
  const purchases: Array<Awaited<ReturnType<typeof tickets.purchaseTickets>>> = [];
  for (const phone of ["0197000011", "0197000012", "0197000013"]) {
    purchases.push(await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2, holderPhone: phone }));
  }
  assert.equal(await prisma.ticket.count({ where: { ticketTypeId: ticketType.id, number: { not: null } } }), 0, "pas de numéro avant paiement");
  for (const p of purchases) {
    await prisma.paymentTransaction.update({ where: { id: p.transaction.id }, data: { providerRef: `demo_${p.transaction.id}` } });
  }
  await Promise.all(purchases.map((p) => verify.applyDemoSuccess(p.transaction.id)));
  const numbers = (await prisma.ticket.findMany({ where: { ticketTypeId: ticketType.id }, select: { number: true } })).map((t) => t.number).sort((a, b) => a! - b!);
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6]);
  assert.equal((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } })).issuedCount, 6);
});

test("scanner : billet d'un autre événement refusé ; double passage indique l'heure du premier", async () => {
  const { event, ticketType } = await seedTicketType();
  const ticket = await prisma.ticket.create({
    data: { ticketTypeId: ticketType.id, eventId: event.id, qrSecret: "secret-scan", status: "PAID", amountCfa: ticketType.priceCfa, number: 42, holderName: "Awa" }
  });
  const other = await prisma.event.create({
    data: { tenantId: event.tenantId, slug: `autre-${Date.now()}`, title: "Autre", status: "ACTIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000) }
  });
  const staff = organizer(event.tenantId);
  await assert.rejects(tickets.validateTicket(staff, { ticketId: ticket.id, secret: "secret-scan", eventId: other.id }), /autre événement/);
  const ok = await tickets.validateTicket(staff, { ticketId: ticket.id, secret: "secret-scan", eventId: event.id });
  assert.equal(ok.ticket.number, "0042");
  assert.equal(ok.ticket.holderName, "Awa");
  await assert.rejects(tickets.validateTicket(staff, { ticketId: ticket.id, secret: "secret-scan", eventId: event.id }), /déjà été utilisé \(le \d\d\/\d\d à \d\d:\d\d\)/);
});

test("lien public d'un billet : ni le téléphone ni l'e-mail de l'acheteur", async () => {
  const { event, ticketType } = await seedTicketType();
  const ticket = await prisma.ticket.create({
    data: { ticketTypeId: ticketType.id, eventId: event.id, qrSecret: "secret-share", status: "PAID", amountCfa: 1000, holderPhone: "2290197000001", holderEmail: "acheteur@x.bj", holderName: "Awa" }
  });
  const shared = await tickets.getPublicTicket(ticket.id, "secret-share");
  assert.equal("holderPhone" in shared, false);
  assert.equal("holderEmail" in shared, false);
  assert.equal(shared.holderName, "Awa");
});
