import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL ?? "" } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Couvre les pages publiques event-as-platform (ADR-016) rendues côté serveur :
//   /e/[slug]          → mini-plateforme de vote
//   /e/[slug]/results  → classement public (votes payés uniquement)
// Ces pages sont des Server Components : on ne peut pas mocker leur fetch depuis
// le navigateur, on provisionne donc de vraies données via l'API (comme
// organizer-flow.spec). Un brouillon n'est pas public. On le met en ligne en base
// (dates futures) pour le rendu et l'état zéro des résultats, sans PSP.
test("pages publiques d'un événement : rendu SSR + état zéro des résultats", async ({
  page,
  request
}) => {
  const unique = `${Date.now()}`;
  const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
  const email = `owner-${unique}@shadowa.test`;
  const password = "SecurePass123!";
  const organizerName = `E2E Public ${unique}`;
  const eventSlug = `concours-public-${unique}`;
  const eventTitle = `Concours Public ${unique}`;

  // 1) Provisionne un tenant + organisateur (API réelle).
  const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { firstName: "E2E", lastName: "Organisateur", phone: "0197000000", organizationName: organizerName, email, password, acceptPrivacyPolicy: true }
  });
  expect(registerResponse.ok()).toBeTruthy();
  const { accessToken } = (await registerResponse.json()) as { accessToken: string };
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // 2) Crée un événement (status DRAFT imposé par le service).
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 172_800_000).toISOString();
  const createEventResponse = await request.post(`${apiBaseUrl}/events`, {
    headers: authHeaders,
    data: { slug: eventSlug, title: eventTitle, startsAt, endsAt, voteUnitPriceCfa: 200 }
  });
  expect(createEventResponse.ok()).toBeTruthy();
  const createdEvent = (await createEventResponse.json()) as { id: string };
  expect(createdEvent.id).toBeTruthy();

  // 3) Ajoute des candidats.
  for (const candidate of [
    { fullName: "Alice Candidate", number: 1, photoUrl: "https://img.test/alice.jpg" },
    { fullName: "Bob Candidate", number: 2, photoUrl: "https://img.test/bob.jpg" }
  ]) {
    const candidateResponse = await request.post(
      `${apiBaseUrl}/events/${createdEvent.id}/candidates`,
      { headers: authHeaders, data: candidate }
    );
    expect(candidateResponse.ok()).toBeTruthy();
  }

  // 4) Un brouillon n'a pas de page publique.
  const draftResponse = await page.goto(`/e/${eventSlug}`);
  expect(draftResponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Ce concours n'est pas disponible" })).toBeVisible();

  // 5) Mise en ligne (dates futures) : la page s'affiche, le vote n'est pas encore ouvert.
  await prisma.event.update({ where: { id: createdEvent.id }, data: { status: "ACTIVE" } });
  await page.goto(`/e/${eventSlug}`);
  await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible();
  await expect(page.getByText(organizerName)).toBeVisible();
  await expect(page.getByText(/Le vote ouvre le/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Résultats" })).toBeVisible();

  // 6) Page publique des résultats (SSR). Aucun vote payé → état zéro + invariant.
  await page.goto(`/e/${eventSlug}/results`);
  await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible();
  await expect(page.getByText("Seuls les votes")).toBeVisible();

  // 7) Slug inexistant → 404.
  const notFoundResponse = await page.goto(`/e/inexistant-${unique}`);
  expect(notFoundResponse?.status()).toBe(404);
});
