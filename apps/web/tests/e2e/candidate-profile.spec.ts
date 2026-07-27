import { expect, test } from "@playwright/test";

// Couvre la feature « profils candidats & partage par candidat » (event-as-platform).
//   /e/[slug]              → hub annuaire (cartes candidats → profils)
//   /e/[slug]/c/[ref]     → profil du candidat (cible du lien partagé, ref sécurisée)
// Pages Server Components : on provisionne de vraies données via l'API (comme
// public-event.spec). Un évènement neuf est DRAFT (activation derrière paiement) ;
// le profil affiche alors la branche « vote pas ouvert ». On valide donc, sans
// dépendre d'un PSP : l'annuaire, la navigation vers le profil, le rendu du
// profil (nom + n°) et le deep-link direct (le lien partagé tombe sur le bon
// candidat), plus le 404.
test("annuaire → profil candidat : navigation, deep-link partagé, 404", async ({ page, request }) => {
  const unique = `${Date.now()}`;
  const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
  const tenantSlug = `e2e-cand-${unique}`;
  const email = `owner-${unique}@shadowa.test`;
  const password = "SecurePass123!";
  const organizerName = `E2E Cand ${unique}`;
  const eventSlug = `concours-cand-${unique}`;
  const eventTitle = `Concours Cand ${unique}`;

  // 1) Tenant + organisateur.
  const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
    data: { tenantSlug, tenantDisplayName: organizerName, email, password, acceptPrivacyPolicy: true }
  });
  expect(registerResponse.ok()).toBeTruthy();
  const { accessToken } = (await registerResponse.json()) as { accessToken: string };
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // 2) Évènement (DRAFT).
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 172_800_000).toISOString();
  const createEventResponse = await request.post(`${apiBaseUrl}/events`, {
    headers: authHeaders,
    data: { slug: eventSlug, title: eventTitle, startsAt, endsAt, voteUnitPriceCfa: 200 }
  });
  expect(createEventResponse.ok()).toBeTruthy();
  const createdEvent = (await createEventResponse.json()) as { id: string };

  // 3) Candidats AVEC photo (requise à la création).
  const createdCandidates: Array<{ fullName: string; publicRef: string; number: number | null }> = [];
  for (const candidate of [
    { fullName: "Alice Candidate", number: 1, photoUrl: "https://img.test/alice.jpg" },
    { fullName: "Bob Candidate", number: 2, photoUrl: "https://img.test/bob.jpg" }
  ]) {
    const candidateResponse = await request.post(`${apiBaseUrl}/events/${createdEvent.id}/candidates`, {
      headers: authHeaders,
      data: candidate
    });
    expect(candidateResponse.ok()).toBeTruthy();
    const body = (await candidateResponse.json()) as {
      fullName: string;
      publicRef: string;
      number: number | null;
    };
    createdCandidates.push({
      fullName: body.fullName,
      publicRef: body.publicRef,
      number: body.number
    });
  }

  const alice = createdCandidates.find((c) => c.fullName === "Alice Candidate");
  const bob = createdCandidates.find((c) => c.fullName === "Bob Candidate");
  expect(alice?.publicRef).toBeTruthy();
  expect(bob?.publicRef).toBeTruthy();

  // 4) Hub annuaire : les candidats sont des cartes-liens, avec leur compteur.
  await page.goto(`/e/${eventSlug}`);
  await expect(page.getByRole("heading", { level: 1, name: eventTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: /Alice Candidate/ })).toBeVisible();
  await expect(page.getByText("0 votes").first()).toBeVisible();

  // 5) Clic sur la carte → profil du candidat (lien sécurisé publicRef).
  await page.getByRole("link", { name: /Alice Candidate/ }).click();
  await expect(page).toHaveURL(new RegExp(`/e/${eventSlug}/c/${alice!.publicRef}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Alice Candidate" })).toBeVisible();
  await expect(page.getByText("Candidat n°1")).toBeVisible();

  // 6) Deep-link partagé direct (autre candidat) → tombe sur SON profil.
  await page.goto(`/e/${eventSlug}/c/${bob!.publicRef}`);
  await expect(page.getByRole("heading", { level: 1, name: "Bob Candidate" })).toBeVisible();

  // 7) Candidat inexistant → 404.
  const notFound = await page.goto(`/e/${eventSlug}/c/zzzzinvalidref0000`);
  expect(notFound?.status()).toBe(404);
});
