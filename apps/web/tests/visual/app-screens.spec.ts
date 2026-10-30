import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Captures Home, auth, dashboard, wallet, éditeur, admin (Lot H2). Données de
// validation uniquement, dans la base e2e ; rien n'est ajouté aux seeds.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "" } } });
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
const OUT = "../../docs/validation";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function shoot(page: Page, width: number, file: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForLoadState("networkidle");
  mkdirSync(`${OUT}/${width}`, { recursive: true });
  await page.screenshot({ path: `${OUT}/${width}/${file}.png`, fullPage: true });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(dashboard|admin)/);
}

test("écrans organisateur et admin à 390 et 1280 px", async ({ page, request }) => {
  test.setTimeout(300_000);
  const unique = `${Date.now()}`;
  const email = `app-${unique}@shadowa.test`;
  const password = "SecurePass123!";

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await shoot(page, width, "home");
    await page.goto("/?auth=register");
    await expect(page.getByRole("dialog")).toBeVisible();
    await shoot(page, width, "modale-inscription");
  }

  const reg = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { firstName: "E2E", lastName: "Organisateur", phone: "0197000000", organizationName: "Comité Miss Campus", email, password, acceptPrivacyPolicy: true }
  });
  expect(reg.ok()).toBeTruthy();
  const { accessToken } = (await reg.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = await request.post(`${apiBaseUrl}/events`, {
    headers,
    data: {
      slug: `app-evt-${unique}`,
      title: "Miss Campus 2026",
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      voteUnitPriceCfa: 100
    }
  });
  expect(created.ok()).toBeTruthy();
  const { id: eventId } = (await created.json()) as { id: string };
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: `app-${unique}` } });
  await prisma.event.update({ where: { id: eventId }, data: { status: "ACTIVE", brandColor: "#14B8A6" } });
  // Solde de démonstration posé en base (le parcours PSP n'est pas l'objet de la capture).
  await prisma.organizerWallet.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, withdrawableCfa: 42_500, heldCfa: 12_000 },
    update: { withdrawableCfa: 42_500, heldCfa: 12_000 }
  });

  await login(page, email, password);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await shoot(page, width, "dashboard");
    await page.goto("/dashboard/wallet");
    await shoot(page, width, "wallet");
    await page.goto(`/dashboard/events/${eventId}/design`);
    await shoot(page, width, "editeur-apparence");
    await page.goto("/dashboard/account");
    await shoot(page, width, "compte");
  }

  // Admin : même utilisateur promu (base de validation seulement), retrait en attente.
  const user = await prisma.user.findFirstOrThrow({ where: { email } });
  await prisma.user.update({ where: { id: user.id }, data: { role: "PLATFORM_ADMIN" } });
  await prisma.withdrawalRequest.create({ data: { tenantId: tenant.id, amountCfa: 15_000, status: "PENDING" } });
  await login(page, email, password);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin");
    await shoot(page, width, "admin");
    await page.goto("/admin/offers/withdrawals");
    await shoot(page, width, "admin-retraits");
    await page.goto("/admin/maintenance");
    await shoot(page, width, "admin-maintenance");
  }
});
