import { test, expect } from "@playwright/test";

test.describe("Auth OTP register path", () => {
  test("register modal exposes offer choice and leads to OTP screen", async ({ page }) => {
    await page.goto("/?auth=register");
    await expect(page.getByText(/Compte de paiement externe|External payment/i).first()).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByText(/Encaissement|Platform collection/i).first()).toBeVisible();
  });
});
