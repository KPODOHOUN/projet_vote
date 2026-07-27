import { expect, test } from "@playwright/test";

// Couvre la page Réglages compte (Task 7) : /dashboard/account
//   - Infos compte : email seedé visible
//   - Sessions actives : la session courante est marquée
//   - Changement de mot de passe : mauvais mot de passe actuel → erreur
// Suit le même pattern que invitations.spec.ts : on provisionne un tenant + OWNER
// via l'API réelle (register), puis on se connecte via le formulaire UI.
test.describe("Réglages compte", () => {
  test("affiche les infos, marque la session courante, rejette un mauvais mot de passe actuel", async ({ page, request }) => {
    const unique = `${Date.now()}`;
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
    const tenantSlug = `e2e-account-${unique}`;
    const email = `owner-${unique}@shadowa.test`;
    const password = "SecurePass123!";
    const tenantDisplayName = `E2E Account ${unique}`;

    const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
      data: { tenantSlug, tenantDisplayName, email, password, acceptPrivacyPolicy: true }
    });
    expect(registerResponse.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/dashboard/account");
    await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();

    // Infos : l'email seedé est visible.
    await expect(page.getByText(email)).toBeVisible();

    // Sessions : la session courante est marquée.
    await expect(page.locator(".vp-event-rows")).toContainText("Session actuelle");

    // Mauvais mot de passe actuel → erreur.
    await page.locator("#pw-current").fill("WrongPass999!");
    await page.locator("#pw-new").fill("NewSecret12345");
    await page.locator("#pw-confirm").fill("NewSecret12345");
    await page.getByRole("button", { name: "Mettre à jour le mot de passe" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Mot de passe actuel invalide." })).toBeVisible();
  });
});
