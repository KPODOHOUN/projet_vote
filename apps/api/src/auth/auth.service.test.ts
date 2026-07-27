import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

// Real-database auth tests — brute-force lockout is persisted in PostgreSQL,
// never an in-memory Map, so it is exercised against the real store here.
const authPrismaService = new PrismaService();
const authService = new AuthService(authPrismaService, new NotificationsService(authPrismaService), new MailService());

const credentials = {
  tenantSlug: "lock-test",
  tenantDisplayName: "Lock Test",
  email: "owner@lock-test.africa",
  password: "SecurePass123!",
  acceptPrivacyPolicy: true as const
};

before(() => {
  assertTestDatabase();
});
beforeEach(async () => {
  await resetDatabase();
  await authService.register(credentials);
});
after(async () => {
  await prisma.$disconnect();
});

test("verrouille le compte après 5 échecs et persiste l'état en base", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      authService.login({ tenantSlug: credentials.tenantSlug, email: credentials.email, password: "WrongPass999!" }),
      /Identifiants invalides/
    );
  }

  // 6th attempt is rejected with the lock message — even with the right password.
  await assert.rejects(
    authService.login({ tenantSlug: credentials.tenantSlug, email: credentials.email, password: credentials.password }),
    /verrouillé/
  );

  const row = await prisma.loginAttempt.findUnique({
    where: { identifier: `${credentials.tenantSlug}:${credentials.email}` }
  });
  assert.ok(row);
  assert.ok(row.count >= 5);
  assert.ok(row.lockedUntil && row.lockedUntil.getTime() > Date.now());
});

test("refresh: rotation single-use + détection de réutilisation révoque toute la chaîne", async () => {
  const { refreshToken: rt1 } = await authService.login({
    tenantSlug: credentials.tenantSlug,
    email: credentials.email,
    password: credentials.password
  });

  // Rotation normale : rt1 → rt2.
  const { refreshToken: rt2 } = await authService.refresh({ refreshToken: rt1 });
  assert.notEqual(rt1, rt2);

  // Rejouer l'ancien token (rt1) = réutilisation → rejet + révocation de chaîne.
  await assert.rejects(authService.refresh({ refreshToken: rt1 }), /réutilisation détectée/);

  // La détection a révoqué toutes les sessions actives : rt2 (légitime) est mort aussi.
  await assert.rejects(authService.refresh({ refreshToken: rt2 }), /Session/);

  // Au moins un évènement d'audit de réutilisation a été écrit (présenter un
  // token révoqué — y compris rt2 tué par la révocation de chaîne — le déclenche).
  const reuseLogs = await prisma.auditLog.findMany({
    where: { action: "auth.refresh_token_reuse_detected" }
  });
  assert.ok(reuseLogs.length >= 1);
});

test("connexion par e-mail seul sans code d'organisation", async () => {
  const result = await authService.login({
    email: credentials.email,
    password: credentials.password
  });
  assert.ok(result.accessToken);
});

test("un login réussi efface le compteur d'échecs", async () => {
  await assert.rejects(
    authService.login({ tenantSlug: credentials.tenantSlug, email: credentials.email, password: "WrongPass999!" }),
    /Identifiants invalides/
  );

  const result = await authService.login({
    tenantSlug: credentials.tenantSlug,
    email: credentials.email,
    password: credentials.password
  });
  assert.equal(typeof result.accessToken, "string");

  const row = await prisma.loginAttempt.findUnique({
    where: { identifier: `${credentials.tenantSlug}:${credentials.email}` }
  });
  assert.equal(row, null);
});

test("register refuse un mot de passe trop court (<10)", async () => {
  await resetDatabase();
  await assert.rejects(
    authService.register({
      tenantSlug: "pw-short",
      tenantDisplayName: "PW Short",
      email: "a@pw-short.africa",
      password: "Ab1cdef",
      acceptPrivacyPolicy: true as const
    }),
    /10 caract|au moins/i
  );
});

test("register refuse un mot de passe sans diversité (une seule classe)", async () => {
  await resetDatabase();
  await assert.rejects(
    authService.register({
      tenantSlug: "pw-weak",
      tenantDisplayName: "PW Weak",
      email: "a@pw-weak.africa",
      password: "aaaaaaaaaa",
      acceptPrivacyPolicy: true as const
    }),
    /deux types|classe|caract/i
  );
});

test("register accepte un mot de passe robuste", async () => {
  await resetDatabase();
  const res = await authService.register({
    tenantSlug: "pw-ok",
    tenantDisplayName: "PW OK",
    email: "a@pw-ok.africa",
    password: "SecurePass123!",
    acceptPrivacyPolicy: true as const
  });
  assert.ok(res);
});

test("login écrit un audit log succès et échec", async () => {
  await assert.rejects(
    authService.login({
      tenantSlug: credentials.tenantSlug,
      email: credentials.email,
      password: "WrongPass999!"
    }),
    /Identifiants invalides/
  );
  await authService.login(
    { tenantSlug: credentials.tenantSlug, email: credentials.email, password: credentials.password },
    { userAgent: "AuditAgent/1.0", ipAddress: "203.0.113.9" }
  );
  const ok = await prisma.auditLog.findMany({ where: { action: "auth.login" } });
  const ko = await prisma.auditLog.findMany({ where: { action: "auth.login_failed" } });
  assert.ok(ok.length >= 1);
  assert.ok(ko.length >= 1);
});

test("login enregistre userAgent + ipAddress sur la session", async () => {
  await authService.login(
    { tenantSlug: credentials.tenantSlug, email: credentials.email, password: credentials.password },
    { userAgent: "TestAgent/1.0", ipAddress: "203.0.113.7" }
  );
  const session = await prisma.authSession.findFirst({
    where: { refreshTokenHash: { not: "" } },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(session);
  assert.equal(session.userAgent, "TestAgent/1.0");
  assert.equal(session.ipAddress, "203.0.113.7");
});
