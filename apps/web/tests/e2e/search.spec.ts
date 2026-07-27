import { expect, test } from "@playwright/test";

// Couvre la recherche globale (Tasks 1–6) :
//   palette header (.vp-search-panel)  → typeahead débouncé, groupé par type
//   /dashboard/search                  → page résultats complète
// Suit le même pattern que invitations.spec.ts / account.spec.ts : on provisionne
// un tenant + OWNER via l'API réelle (register), on se connecte via le formulaire UI,
// puis on seede un événement via l'API (même token) pour avoir un titre connu à chercher.
test.describe("Recherche globale", () => {
  test("typeahead header montre un événement et la page résultats l'affiche", async ({ page, request }) => {
    const unique = `${Date.now()}`;
    const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3011/api/v1";
    const tenantSlug = `e2e-search-${unique}`;
    const email = `owner-${unique}@shadowa.test`;
    const password = "SecurePass123!";
    const tenantDisplayName = `E2E Search ${unique}`;
    const title = `Concours Recherche ${unique}`;

    const registerResponse = await request.post(`${apiBaseUrl}/auth/register`, {
      data: { tenantSlug, tenantDisplayName, email, password, acceptPrivacyPolicy: true }
    });
    expect(registerResponse.ok()).toBeTruthy();
    const { accessToken } = await registerResponse.json();
    expect(accessToken).toBeTruthy();

    const eventResponse = await request.post(`${apiBaseUrl}/events`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        slug: `concours-recherche-${unique}`,
        title,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString()
      }
    });
    expect(eventResponse.ok()).toBeTruthy();

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    const searchBox = page.getByRole("searchbox", { name: /recherche globale|global search/i });
    await searchBox.fill(title.slice(0, 10));

    await expect(page.locator(".vp-search-panel")).toContainText(title);

    await searchBox.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/search\?q=/);
    await expect(page.locator(".vp-event-rows")).toContainText(title);
  });
});
