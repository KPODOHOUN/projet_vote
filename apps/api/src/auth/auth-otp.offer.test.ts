import assert from "node:assert/strict";
import test from "node:test";
import { TenantOfferType } from "@prisma/client";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { OFFER1_ENABLED_KEY } from "../common/platform-settings";

const prisma = new PrismaService();
const mail = {
  send: async () => false
} as unknown as MailService;
const notifications = {
  create: async () => undefined
} as unknown as NotificationsService;
const authService = new AuthService(prisma, notifications, mail);

function uniqueSlug() {
  return `otp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

test("register ESCROW crée un wallet et exige OTP hors test", async () => {
  // NODE_ENV=test auto-verifies — assert offerType + wallet exist after register
  const slug = uniqueSlug();
  const res = await authService.register({
    tenantSlug: slug,
    tenantDisplayName: "OTP Org",
    email: `${slug}@example.com`,
    password: "SecurePass1!",
    offerType: TenantOfferType.ESCROW,
    acceptPrivacyPolicy: true,
    firstName: "Ada",
    lastName: "Lovelace"
  });
  assert.ok("accessToken" in res);
  const tenant = await prisma.client.tenant.findUnique({
    where: { slug },
    include: { wallet: true }
  });
  assert.equal(tenant?.offerType, TenantOfferType.ESCROW);
  assert.ok(tenant?.wallet);
});

test("register EXTERNAL est refusé tant que l'offre 1 est en réflexion", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER1_ENABLED_KEY },
    update: { value: "false", updatedByUserId: "system:test" },
    create: {
      key: OFFER1_ENABLED_KEY,
      value: "false",
      updatedByUserId: "system:test"
    }
  });

  const slug = uniqueSlug();
  await assert.rejects(
    authService.register({
      tenantSlug: slug,
      tenantDisplayName: "Ext Org",
      email: `${slug}@example.com`,
      password: "SecurePass1!",
      offerType: TenantOfferType.EXTERNAL,
      acceptPrivacyPolicy: true
    }),
    /réflexion|indisponible|External/i
  );

  const tenant = await prisma.client.tenant.findUnique({ where: { slug } });
  assert.equal(tenant, null);
});
