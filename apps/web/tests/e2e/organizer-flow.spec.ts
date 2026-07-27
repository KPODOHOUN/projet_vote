import { expect, test } from "@playwright/test";

test("parcours express: inscription -> lancement concours en une étape", async ({ page, request }) => {
  const unique = `${Date.now()}`;
  const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
  const tenantSlug = `e2e-vote-${unique}`;
  const email = `owner-${unique}@shadowa.test`;
  const password = "SecurePass123!";
  const tenantDisplayName = `E2E Vote ${unique}`;

  const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      tenantSlug,
      tenantDisplayName,
      email,
      password,
      acceptPrivacyPolicy: true
    }
  });
  expect(registerResponse.ok()).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Lancez votre évènement en une étape" })).toBeVisible();

  await page.getByLabel("Nom de l'évènement").fill(`Finale E2E ${unique}`);
  await page.getByLabel("Premier candidat").fill("Candidate E2E");
  await page.getByRole("button", { name: "Lancer mon évènement" }).click();

  const successHeading = page
    .getByRole("heading", { name: "Presque fini !" })
    .or(page.getByRole("heading", { name: "Votre page de vote est en ligne !" }));
  await expect(successHeading).toBeVisible();
  await expect(page.getByRole("link", { name: "Personnaliser la page" })).toBeVisible();

  const copyLinkButton = page.getByRole("button", { name: "Copier le lien public" });
  if (await copyLinkButton.isVisible()) {
    await expect(copyLinkButton).toBeEnabled();
  }
});
