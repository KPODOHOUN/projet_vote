import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { AuthService } from "../auth/auth.service";
import { EventsService } from "../events/events.service";
import { VotesService } from "../votes/votes.service";
import { NotificationsService } from "./notifications.service";
import { MailService } from "../mail/mail.service";
import { PartnersService } from "../partners/partners.service";
import { noopPartnerNotifications } from "../partners/partner-notifications.stub";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const notifications = new NotificationsService(prismaService);
const authService = new AuthService(prismaService, notifications, new MailService());
const votesService = new VotesService(prismaService);
const eventsService = new EventsService(
  prismaService,
  votesService,
  notifications,
  new PartnersService(prismaService, noopPartnerNotifications())
);

const creds = {
  tenantSlug: "trig",
  tenantDisplayName: "Trig",
  email: "owner@trig.africa",
  password: "SecurePass123!",
  acceptPrivacyPolicy: true as const
};

before(() => assertTestDatabase());
beforeEach(async () => {
  await resetDatabase();
});
after(async () => {
  await prisma.$disconnect();
});

test("acceptInvitation déclenche une notification INVITATION_ACCEPTED pour l'owner", async () => {
  await authService.register(creds);
  const owner = await prisma.user.findFirstOrThrow({ where: { email: creds.email } });
  // créer une invitation directement
  const { createHash, randomBytes } = await import("crypto");
  const rawToken = randomBytes(32).toString("hex");
  await prisma.invitation.create({
    data: {
      tenantId: owner.tenantId,
      email: "newbie@trig.africa",
      role: "ORGANIZER_STAFF",
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1e9),
      invitedByUserId: owner.id
    }
  });
  await authService.acceptInvitation({ token: rawToken, password: "AcceptPass123!" });
  // laisser le fire-and-forget se résoudre
  await new Promise((r) => setTimeout(r, 50));
  const notifs = await prisma.notification.findMany({ where: { userId: owner.id, type: "INVITATION_ACCEPTED" } });
  assert.equal(notifs.length, 1);
});

test("updateEvent vers ACTIVE déclenche une notification EVENT_ACTIVATED pour l'owner", async () => {
  await authService.register(creds);
  const owner = await prisma.user.findFirstOrThrow({ where: { email: creds.email } });
  const authUser = {
    userId: owner.id,
    tenantId: owner.tenantId,
    role: owner.role,
    email: owner.email
  };
  const event = await prisma.event.create({
    data: {
      tenantId: owner.tenantId,
      slug: "trig-evt",
      title: "Trig Event",
      status: "DRAFT",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      activationPaidAt: new Date()
    }
  });

  const updated = await eventsService.updateEvent(authUser, event.id, { status: "ACTIVE" });
  assert.equal(updated.status, "ACTIVE");

  await new Promise((r) => setTimeout(r, 50));
  const notifs = await prisma.notification.findMany({ where: { userId: owner.id, type: "EVENT_ACTIVATED" } });
  assert.equal(notifs.length, 1);
});
