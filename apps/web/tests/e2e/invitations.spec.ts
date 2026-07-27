import { expect, test } from "@playwright/test";

// Couvre la gestion des invitations d'équipe (Tasks 1–5) :
//   /dashboard/team               → création, lien à usage unique, liste, révocation (OWNER)
//   /accept-invitation/[token]    → activation publique, y compris le cas token invalide
// Suit le même pattern que organizer-flow.spec.ts / public-event.spec.ts : on provisionne
// un tenant + OWNER via l'API réelle (register), puis on se connecte via le formulaire UI.
test.describe("Invitations", () => {
  test("OWNER crée une invitation, voit le lien, révoque", async ({ page, request }) => {
    const unique = `${Date.now()}`;
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
    const tenantSlug = `e2e-invite-${unique}`;
    const email = `owner-${unique}@shadowa.test`;
    const password = "SecurePass123!";
    const tenantDisplayName = `E2E Invite ${unique}`;
    const inviteeEmail = `invitee-${unique}@example.com`;

    const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
      data: { tenantSlug, tenantDisplayName, email, password, acceptPrivacyPolicy: true }
    });
    expect(registerResponse.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/dashboard/team");
    await expect(page.getByRole("heading", { name: "Équipe" })).toBeVisible();

    await page.getByLabel("Adresse e-mail").fill(inviteeEmail);
    await page.getByRole("button", { name: "Créer l'invitation" }).click();

    const link = page.locator(".vp-invite-link-field");
    await expect(link).toBeVisible();
    await expect(link).toHaveValue(/\/accept-invitation\//);

    await expect(page.locator(".vp-event-rows")).toContainText(inviteeEmail);
    await expect(page.locator(".vp-event-rows")).toContainText("En attente");

    await page.getByRole("button", { name: "Révoquer" }).first().click();
    await page.getByRole("button", { name: "Révoquer" }).last().click();
    await expect(page.locator(".vp-event-rows")).toContainText("Révoquée");
  });

  test("Invité active son accès via le lien et atterrit sur le dashboard", async ({ page, request }) => {
    const unique = `${Date.now()}-accept`;
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
    const tenantSlug = `e2e-invite-${unique}`;
    const email = `owner-${unique}@shadowa.test`;
    const password = "SecurePass123!";
    const tenantDisplayName = `E2E Invite ${unique}`;
    const inviteeEmail = `invitee-${unique}@example.com`;

    const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
      data: { tenantSlug, tenantDisplayName, email, password, acceptPrivacyPolicy: true }
    });
    expect(registerResponse.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/dashboard/team");
    await page.getByLabel("Adresse e-mail").fill(inviteeEmail);
    await page.getByRole("button", { name: "Créer l'invitation" }).click();

    const link = page.locator(".vp-invite-link-field");
    await expect(link).toBeVisible();
    await expect(link).toHaveValue(/\/accept-invitation\//);
    const inviteUrl = await link.inputValue();

    await page.goto(inviteUrl);
    const inviteePassword = "InviteePass123!";
    await page.getByLabel("Mot de passe", { exact: true }).fill(inviteePassword);
    await page.getByLabel("Confirmer le mot de passe").fill(inviteePassword);
    await page.getByRole("button", { name: "Activer mon accès" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Token invalide → message d'erreur", async ({ page }) => {
    await page.goto("/accept-invitation/invalidtoken00000000000000000000000000000000");
    await page.getByLabel("Mot de passe", { exact: true }).fill("password123!");
    await page.getByLabel("Confirmer le mot de passe").fill("password123!");
    await page.getByRole("button", { name: "Activer mon accès" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /invalide|expirée/i })).toBeVisible();
  });
});
