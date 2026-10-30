import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { env } from "../config/env";

const prisma = new PrismaService();
const mail = {
  send: async () => false
} as unknown as MailService;
const notifications = {
  create: async () => undefined
} as unknown as NotificationsService;
const authService = new AuthService(prisma, notifications, mail);

const uniqueEmail = () => `otp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const base = (email: string) => ({
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "0197000001",
  email,
  password: "SecurePass1!",
  acceptPrivacyPolicy: true
});

test("inscription : prénom, nom, téléphone, email — sans offre ni abonnement — crée l'espace et le portefeuille", async () => {
  const email = uniqueEmail();
  const res = await authService.register(base(email));
  assert.ok("accessToken" in res);
  const user = await prisma.client.user.findFirstOrThrow({
    where: { email },
    include: { tenant: { include: { wallet: true } } }
  });
  assert.equal(user.firstName, "Ada");
  assert.equal(user.phone, "2290197000001", "téléphone normalisé comme pour les paiements");
  assert.equal(user.role, "ORGANIZER_OWNER");
  assert.equal(user.tenant.displayName, "Ada Lovelace", "nom public par défaut");
  assert.ok(user.tenant.wallet, "portefeuille créé");
});

test("inscription : un email déjà utilisé est refusé (409), quelle que soit la casse", async () => {
  const email = uniqueEmail();
  await authService.register(base(email));
  await assert.rejects(authService.register(base(email.toUpperCase())), (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 409);
});

test("inscription : téléphone manquant ou numéro béninois impossible refusés", async () => {
  await assert.rejects(authService.register({ ...base(uniqueEmail()), phone: "" }));
  await assert.rejects(authService.register({ ...base(uniqueEmail()), phone: "0766000001" }), /Numéro béninois invalide/);
  await assert.rejects(authService.register({ ...base(uniqueEmail()), acceptPrivacyPolicy: false }));
});

test("inscription en production : un code non envoyé renvoie une erreur 503, pas un succès silencieux", async () => {
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    await assert.rejects(
      authService.register(base(uniqueEmail())),
      (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 503
    );
  } finally {
    env.NODE_ENV = previous;
  }
});
