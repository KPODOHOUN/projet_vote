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
    /Ticket introuvable/
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

test("concours publié : le prix d'un billet existant est figé par le contrat, le reste se modifie", async () => {
  const { event, ticketType } = await seedTicketType();
  await assert.rejects(
    tickets.updateTicketType(event.id, ticketType.id, { priceCfa: 5_000 }),
    /prix de ce billet est fixé par le contrat signé/
  );
  // Même prix renvoyé par le formulaire, quantité modifiée : accepté.
  const updated = await tickets.updateTicketType(event.id, ticketType.id, { priceCfa: 2_000, quantity: 80 });
  assert.equal(updated.priceCfa, 2_000);
  assert.equal(updated.quantity, 80);

  // En brouillon (avant signature), le prix reste libre.
  await prisma.event.update({ where: { id: event.id }, data: { status: EventStatus.DRAFT } });
  assert.equal((await tickets.updateTicketType(event.id, ticketType.id, { priceCfa: 5_000 })).priceCfa, 5_000);
});
