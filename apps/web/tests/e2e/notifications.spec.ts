import { expect, test } from "@playwright/test";

// Couvre la cloche de notifications (Tasks 1–8) via un VRAI déclencheur :
// quand un invité accepte son invitation, l'OWNER du tenant reçoit une notification
// INVITATION_ACCEPTED (fan-out par tenantId, cf. apps/api/src/auth/auth.service.ts).
// Suit le même pattern que invitations.spec.ts : provisionner un tenant + OWNER via
// l'API réelle (register), se connecter via le formulaire UI, créer l'invitation,
// accepter via le lien à usage unique dans un contexte de navigateur séparé (pour ne
// pas perdre la session OWNER), puis revenir sur le dashboard OWNER et ouvrir la cloche.
test.describe("Notifications", () => {
  test("l'acceptation d'une invitation crée une notification visible dans la cloche de l'OWNER", async ({
    page,
    request,
    browser
  }) => {
    const unique = `${Date.now()}-notif`;
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
    const tenantSlug = `e2e-notif-${unique}`;
    const email = `owner-${unique}@shadowa.test`;
    const password = "SecurePass123!";
    const tenantDisplayName = `E2E Notif ${unique}`;
    const inviteeEmail = `invitee-${unique}@example.com`;

    const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
      data: { tenantSlug, tenantDisplayName, email, password, acceptPrivacyPolicy: true }
    });
    expect(registerResponse.ok()).toBeTruthy();

    // 1. OWNER se connecte et crée une invitation.
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

    // 2. L'invité accepte dans un contexte de navigateur séparé pour préserver la
    //    session OWNER dans `page` (sinon naviguer vers /accept-invitation déconnecterait
    //    l'OWNER et reconnecterait en tant qu'invité dans le même contexte).
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    const inviteePassword = "InviteePass123!";
    await inviteePage.goto(inviteUrl);
    await inviteePage.getByLabel("Mot de passe", { exact: true }).fill(inviteePassword);
    await inviteePage.getByLabel("Confirmer le mot de passe").fill(inviteePassword);
    await inviteePage.getByRole("button", { name: "Activer mon accès" }).click();
    await expect(inviteePage).toHaveURL(/\/dashboard/);
    await inviteeContext.close();

    // 3. L'OWNER recharge son dashboard : la cloche doit refléter la notification
    //    INVITATION_ACCEPTED créée par le vrai déclencheur côté API.
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard");

    const bellButton = page.getByRole("button", { name: /notifications/i }).first();
    await expect(bellButton).toBeVisible();
    await expect(bellButton).toHaveAttribute("aria-label", /\(([1-9]\d*)\)/);
    await bellButton.click();

    await expect(page.getByText(/invitation acceptée/i)).toBeVisible();
    await expect(page.getByText(inviteeEmail)).toBeVisible();
  });
});
