import { expect, test } from "@playwright/test";

test("parcours express: inscription -> lancement concours en une étape", async ({ page, request }) => {
  const unique = `${Date.now()}`;
  const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
  const email = `owner-${unique}@shadowa.test`;
  const password = "SecurePass123!";
  const tenantDisplayName = `E2E Vote ${unique}`;

  const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      firstName: "E2E",
      lastName: "Organisateur",
      phone: "0197000000",
      organizationName: tenantDisplayName,
      email,
      password,
      acceptPrivacyPolicy: true
    }
  });
  expect(registerResponse.ok()).toBeTruthy();

  await page.goto("/login");
  // #email : le label « Adresse e-mail » matche aussi l'input newsletter du footer (strict mode).
  await page.locator("#email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Lancez votre événement en une étape" })).toBeVisible();

  await page.getByLabel("Nom de l'événement").fill(`Finale E2E ${unique}`);
  await page.getByLabel("Premier candidat").fill("Candidate E2E");
  await page.getByRole("button", { name: "Lancer mon événement" }).click();

  // Le concours est créé en brouillon : il passe en ligne à la signature du contrat.
  await expect(page.getByRole("heading", { name: "Votre concours est créé" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Personnaliser la page" })).toBeVisible();

  await page.getByRole("link", { name: "Fixer le prix du vote" }).click();
  await page.getByLabel("Prix d'un vote (F CFA)").fill("200");
  const eventId = page.url().split("/events/")[1]!.split("/")[0]!;
  const saved = page.waitForResponse((res) => res.url().endsWith(`/events/${eventId}`) && res.request().method() === "PATCH");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  expect((await saved).ok()).toBeTruthy();

  await page.goto(`/dashboard/events/${eventId}/contract`);
  await expect(page.getByRole("heading", { name: "Contrat du concours" })).toBeVisible();
  // Prénom, nom, téléphone et organisation sont repris du compte.
  await expect(page.getByLabel("Prénom")).toHaveValue("E2E");
  await page.getByLabel("Adresse complète").fill("Rue 12, Cotonou");
  await page.getByLabel("Type de pièce d'identité").fill("Carte d'identité");
  await page.getByLabel("Numéro de la pièce").fill("CI-123456");
  await page.getByRole("button", { name: "Générer le contrat" }).click();

  const reader = page.getByLabel("Texte du contrat");
  await expect(reader).toContainText("12 %");
  await reader.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByLabel("J'ai lu et j'accepte ce contrat.").check();
  await page.getByLabel("Saisissez votre nom complet").fill("E2E Organisateur");
  await page.getByRole("button", { name: "Recevoir mon code de signature" }).click();
  // Sans service d'email (base e2e), le code est affiché en mode test.
  const devCode = (await page.getByText(/Mode test, code :/).innerText()).match(/\d{6}/)?.[0];
  expect(devCode).toBeTruthy();
  await page.getByLabel("Code reçu par email (6 chiffres)").fill(devCode!);
  await page.getByRole("button", { name: "Signer et mettre en ligne" }).click();

  await expect(page.getByText("Contrat signé", { exact: true })).toBeVisible();
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le contrat signé (PDF)" }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
});
