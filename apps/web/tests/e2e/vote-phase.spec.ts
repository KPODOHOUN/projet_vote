import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Phase de vote (7.11-c) : l'interface ne promet jamais un vote que l'API
// refusera. La mise en ligne passe par la signature du contrat (couverte par
// organizer-flow.spec) : ici on la pose en base (base e2e).
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "" } } });
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function activeEvent(
  request: import("@playwright/test").APIRequestContext,
  label: string,
  startsAt: Date,
  endsAt: Date
) {
  const unique = `${label}-${Date.now()}`;
  const register = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      firstName: "E2E",
      lastName: "Organisateur",
      phone: "0197000000",
      organizationName: `E2E ${unique}`,
      email: `owner-${unique}@shadowa.test`,
      password: "SecurePass123!",
      acceptPrivacyPolicy: true
    }
  });
  expect(register.ok()).toBeTruthy();
  const { accessToken } = (await register.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const slug = `phase-${unique}`;
  const created = await request.post(`${apiBaseUrl}/events`, {
    headers,
    data: {
      slug,
      title: `Phase ${unique}`,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      voteUnitPriceCfa: 100
    }
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  const candidate = await request.post(`${apiBaseUrl}/events/${id}/candidates`, { headers, data: { fullName: "Alice Phase", number: 1 } });
  expect(candidate.ok()).toBeTruthy();
  const { publicRef } = (await candidate.json()) as { publicRef: string };
  await prisma.event.update({ where: { id }, data: { status: "ACTIVE", startsAt, endsAt } });
  return { slug, publicRef };
}

test("événement à venir : message « ouvre le », aucun formulaire de paiement", async ({ page, request }) => {
  const { slug, publicRef } = await activeEvent(
    request,
    "upcoming",
    new Date(Date.now() + 3 * 86_400_000),
    new Date(Date.now() + 5 * 86_400_000)
  );
  await page.goto(`/e/${slug}`);
  await expect(page.getByText(/Le vote ouvre le/)).toBeVisible();
  await page.goto(`/e/${slug}/c/${publicRef}`);
  await expect(page.getByText(/Le vote ouvre le/)).toBeVisible();
  await expect(page.getByLabel("Ton numéro Mobile Money")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Payer/ })).toHaveCount(0);
});

test("événement terminé (cron pas encore passé) : « Le vote est terminé », lien résultats, aucun formulaire", async ({ page, request }) => {
  const { slug, publicRef } = await activeEvent(
    request,
    "ended",
    new Date(Date.now() - 5 * 86_400_000),
    new Date(Date.now() - 86_400_000)
  );
  await page.goto(`/e/${slug}/c/${publicRef}`);
  await expect(page.getByText("Le vote est terminé.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir les résultats" })).toBeVisible();
  await expect(page.getByLabel("Ton numéro Mobile Money")).toHaveCount(0);
});

test("vote ouvert : le formulaire de paiement est proposé", async ({ page, request }) => {
  const { slug, publicRef } = await activeEvent(
    request,
    "open",
    new Date(Date.now() - 86_400_000),
    new Date(Date.now() + 86_400_000)
  );
  await page.goto(`/e/${slug}/c/${publicRef}`);
  await expect(page.getByLabel("Ton numéro Mobile Money")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Payer/ })).toBeVisible();
});

test("billetterie : vente ouverte, le paiement exige un numéro Mobile Money", async ({ page, request }) => {
  const { slug } = await activeEvent(
    request,
    "tickets",
    new Date(Date.now() - 86_400_000),
    new Date(Date.now() + 86_400_000)
  );
  const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
  await prisma.ticketType.create({ data: { eventId: event.id, name: "Entrée standard", priceCfa: 1500, quantity: 10 } });

  await page.goto(`/e/${slug}/tickets`);
  await expect(page.getByRole("heading", { name: "Acheter des billets" })).toBeVisible();
  await page.getByRole("button", { name: /Entrée standard/ }).click();
  const pay = page.getByRole("button", { name: /^Payer/ });
  await expect(pay).toBeDisabled();
  await page.getByLabel("Numéro Mobile Money qui paie").fill("+22997000001");
  // Sans réseau choisi, le paiement reste bloqué.
  await expect(pay).toBeDisabled();
  await page.getByLabel("Réseau").selectOption("mtn");
  await expect(pay).toBeEnabled();
});
