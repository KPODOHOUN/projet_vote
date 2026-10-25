import { test, expect } from "@playwright/test";

test.describe("Auth OTP register path", () => {
  // D10 / 7.5 : la modale n'expose que l'offre Escrow ; l'offre externe n'est plus proposée.
  test("register modal shows the Escrow offer only", async ({ page }) => {
    await page.goto("/?auth=register");
    await expect(page.getByText(/Encaissement plateforme|Platform collection/i).first()).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByText(/Compte de paiement externe|External payment/i)).toHaveCount(0);
  });
});
