import "reflect-metadata";
import { test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus } from "@prisma/client";
import { env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";
import { TicketsService } from "./tickets.service";

const tickets = new TicketsService(new PrismaService(), new MailService());

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

test("purchaseTickets: refusé hors mode démo, sans créer de billet ni de transaction", async () => {
  const { event, ticketType } = await seedTicketType();
  assert.equal(env.API_PAYMENT_DEMO_MODE, false);

  await assert.rejects(
    tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2 }),
    (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 503
  );
  assert.equal(await prisma.ticket.count({ where: { eventId: event.id } }), 0);
  assert.equal(await prisma.paymentTransaction.count({ where: { eventId: event.id } }), 0);
});

test("purchaseTickets: en mode démo, le comportement existant est conservé (billets PAID)", async () => {
  const { event, ticketType } = await seedTicketType();
  const previous = env.API_PAYMENT_DEMO_MODE;
  env.API_PAYMENT_DEMO_MODE = true;
  try {
    const result = await tickets.purchaseTickets(event.slug, { ticketTypeId: ticketType.id, quantity: 2 });
    assert.equal(result.tickets.length, 2);
    const rows = await prisma.ticket.findMany({ where: { eventId: event.id } });
    assert.deepEqual(rows.map((r) => r.status), ["PAID", "PAID"]);
  } finally {
    env.API_PAYMENT_DEMO_MODE = previous;
  }
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
    tickets.validateTicket({ ticketId: ticket.id, secret: "secret-reserved" }),
    /pas encore été payé/
  );
  const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(after.status, "RESERVED");
});
