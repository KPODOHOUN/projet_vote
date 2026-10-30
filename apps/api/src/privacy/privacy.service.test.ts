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
  firstName: "Priv",
  lastName: "Test",
  phone: "0197100002",
  email: "user@priv.bj",
  password: "SecurePass123!",
  acceptPrivacyPolicy: true as const
};

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seedUser() {
  await auth.register(creds); // crée tenant + user owner + 1 session
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { users: { some: { email: creds.email } } } });
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
  await auth.login({ email: creds.email, password: creds.password });

  const res = await privacy.anonymizeUserData(authUser, { currentPassword: creds.password });
  assert.match(res.anonymizedEmail, /^deleted\+/);

  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.email, res.anonymizedEmail);

  const activeSessions = await prisma.authSession.count({ where: { userId: user.id, revokedAt: null } });
  assert.equal(activeSessions, 0);

  // Le hash de mot de passe est invalidé → l'ancien mot de passe ne marche plus.
  await assert.rejects(
    auth.login({ email: res.anonymizedEmail, password: creds.password }),
    /Identifiants invalides/
  );
});

test("suppression: efface aussi prénom, nom, téléphone et photo", async () => {
  const { user, authUser } = await seedUser();
  await prisma.user.update({ where: { id: user.id }, data: { firstName: "Awa", lastName: "K", phone: "+22997000000", photoUrl: "https://x/y.png" } });
  await privacy.anonymizeUserData(authUser, { currentPassword: creds.password });
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.deepEqual([after.firstName, after.lastName, after.phone, after.photoUrl], [null, null, null, null]);
});

test("suppression: refusée avec un mauvais mot de passe, rien n'est effacé", async () => {
  const { user, authUser } = await seedUser();
  await assert.rejects(privacy.anonymizeUserData(authUser, { currentPassword: "Faux123!" }), /Mot de passe incorrect/);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.email, creds.email);
});

test("suppression: refusée pour un responsable avec un événement en cours ou un solde", async () => {
  const { tenant, authUser } = await seedUser();
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, slug: "priv-live", title: "Live", status: "ACTIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000) }
  });
  await assert.rejects(privacy.anonymizeUserData(authUser, { currentPassword: creds.password }), /événements en cours/);
  await prisma.event.update({ where: { id: event.id }, data: { status: "CLOSED" } });
  await prisma.organizerWallet.update({ where: { tenantId: tenant.id }, data: { withdrawableCfa: 500 } });
  await assert.rejects(privacy.anonymizeUserData(authUser, { currentPassword: creds.password }), /solde de votre portefeuille/);
});
