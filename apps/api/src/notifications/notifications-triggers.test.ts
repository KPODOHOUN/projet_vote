import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "./notifications.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const notifications = new NotificationsService(prismaService);
const authService = new AuthService(prismaService, notifications, new MailService());

const creds = {
  firstName: "Trig",
  lastName: "Test",
  phone: "0197100003",
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
