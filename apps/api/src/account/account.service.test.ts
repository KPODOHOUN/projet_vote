import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { compare } from "bcryptjs";
import { AccountService } from "./account.service";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const authService = new AuthService(prismaService, new NotificationsService(prismaService), new MailService());
const accountService = new AccountService(prismaService, authService);

const creds = {
  tenantSlug: "acct-test",
  tenantDisplayName: "Acct Test",
  email: "owner@acct-test.africa",
  password: "SecurePass123!",
  acceptPrivacyPolicy: true as const
};

async function seedAndLogin() {
  await authService.register(creds);
  const { refreshToken, accessToken } = await authService.login({
    tenantSlug: creds.tenantSlug, email: creds.email, password: creds.password
  });
  const user = await authService.verifyAccessToken(accessToken);
  return { user, refreshToken };
}

before(() => assertTestDatabase());
beforeEach(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

test("changePassword: mauvais mot de passe actuel → rejet", async () => {
  const { user, refreshToken } = await seedAndLogin();
  await assert.rejects(
    accountService.changePassword(user, { currentPassword: "WrongPass999!", newPassword: "NewPass12345!" }, refreshToken),
    /actuel|invalide|incorrect/i
  );
});

test("changePassword: succès met à jour le hash et révoque les autres sessions", async () => {
  const { user, refreshToken } = await seedAndLogin();
  // 2e session (autre appareil)
  await authService.login({ tenantSlug: creds.tenantSlug, email: creds.email, password: creds.password }, { userAgent: "Other", ipAddress: "1.2.3.4" });
  await accountService.changePassword(user, { currentPassword: creds.password, newPassword: "NewPass12345!" }, refreshToken);
  const dbUser = await prisma.user.findFirst({ where: { id: user.userId } });
  assert.ok(dbUser && (await compare("NewPass12345!", dbUser.passwordHash)));
  const active = await prisma.authSession.findMany({ where: { userId: user.userId, revokedAt: null } });
  // seule la session courante survit
  assert.equal(active.length, 1);
  assert.equal(active[0]?.refreshTokenHash, authService.hashRefreshToken(refreshToken));
});

test("changeEmail: email déjà membre → conflit", async () => {
  const { user, refreshToken } = await seedAndLogin();
  // un second user dans le même tenant
  await prisma.user.create({ data: { tenantId: user.tenantId, email: "taken@acct-test.africa", passwordHash: "x", role: "ORGANIZER_STAFF" } });
  await assert.rejects(
    accountService.changeEmail(user, { newEmail: "taken@acct-test.africa", currentPassword: creds.password }, refreshToken),
    /déjà|exist|conflit/i
  );
});

test("changeEmail: succès met à jour l'email et réémet un access token le contenant", async () => {
  const { user, refreshToken } = await seedAndLogin();
  const { accessToken } = await accountService.changeEmail(user, { newEmail: "new@acct-test.africa", currentPassword: creds.password }, refreshToken);
  const decoded = await authService.verifyAccessToken(accessToken);
  assert.equal(decoded.email, "new@acct-test.africa");
  const dbUser = await prisma.user.findFirst({ where: { id: user.userId } });
  assert.equal(dbUser?.email, "new@acct-test.africa");
});

test("listSessions: marque la session courante et exclut les révoquées", async () => {
  const { user, refreshToken } = await seedAndLogin();
  const { items } = await accountService.listSessions(user, refreshToken);
  assert.ok(items.length >= 1);
  const current = items.filter((s) => s.current);
  assert.equal(current.length, 1);
});

test("changePassword sans refresh token courant ne révoque pas toutes les sessions (rejet)", async () => {
  const { user } = await seedAndLogin();
  // appel sans currentRefreshToken
  await assert.rejects(
    accountService.changePassword(user, { currentPassword: creds.password, newPassword: "NewPass12345!" }, undefined),
    /session|courante|introuvable/i
  );
  // aucune session révoquée
  const active = await prisma.authSession.findMany({ where: { userId: user.userId, revokedAt: null } });
  assert.ok(active.length >= 1);
});

test("revokeSession: session d'un autre user → introuvable", async () => {
  const { user } = await seedAndLogin();
  // session appartenant à un autre user
  const other = await prisma.user.create({ data: { tenantId: user.tenantId, email: "other@acct-test.africa", passwordHash: "x", role: "ORGANIZER_STAFF" } });
  const otherSession = await prisma.authSession.create({ data: { tenantId: user.tenantId, userId: other.id, refreshTokenHash: "deadbeef", expiresAt: new Date(Date.now() + 1e9) } });
  await assert.rejects(accountService.revokeSession(user, otherSession.id), /introuvable|not found|404/i);
});
