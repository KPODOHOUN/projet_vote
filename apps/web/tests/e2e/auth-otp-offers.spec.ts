import { test, expect } from "@playwright/test";

test.describe("Auth OTP register path", () => {
  // Inscription simple : identité et contact, aucune offre ni abonnement à choisir.
  test("register modal asks for identity only, no offer or subscription", async ({ page }) => {
    await page.goto("/?auth=register");
    await expect(page.getByLabel("Prénom")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Nom", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Téléphone")).toBeVisible();
    await expect(page.getByText(/abonnement|Encaissement par SHADOMA|Paiement direct/i)).toHaveCount(0);
  });
});
