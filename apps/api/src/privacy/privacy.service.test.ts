import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivacyService } from "./privacy.service";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const privacy = new PrivacyService(prismaService);
const auth = new AuthService(prismaService, new NotificationsService(prismaService), new MailService());

const creds = {
  tenantSlug: "priv-test",
  tenantDisplayName: "Priv",
  email: "user@priv.bj",
  password: "SecurePass123!",
  acceptPrivacyPolicy: true as const
};

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedUser() {
  await auth.register(creds); // crée tenant + user owner + 1 session
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: creds.tenantSlug } });
  const user = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId: tenant.id, email: creds.email } }
  });
  return {
    tenant,
    user,
    authUser: { userId: user.id, tenantId: tenant.id, email: user.email, role: UserRole.ORGANIZER_OWNER }
  };
}

test("export: renvoie un buffer ZIP non vide (magic bytes PK)", async () => {
  const { authUser } = await seedUser();
  const buf = await privacy.buildUserExportArchive(authUser);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 0);
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
});

test("suppression: anonymise l'email, révoque les sessions actives", async () => {
  const { user, authUser } = await seedUser();
  await auth.login({ tenantSlug: creds.tenantSlug, email: creds.email, password: creds.password });

  const res = await privacy.anonymizeUserData(authUser);
  assert.match(res.anonymizedEmail, /^deleted\+/);

  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.email, res.anonymizedEmail);

  const activeSessions = await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } });
  assert.equal(activeSessions, 0);

  // Le hash de mot de passe est invalidé → l'ancien mot de passe ne marche plus.
  await assert.rejects(
    auth.login({ tenantSlug: creds.tenantSlug, email: res.anonymizedEmail, password: creds.password }),
    /Identifiants invalides/
  );
});
