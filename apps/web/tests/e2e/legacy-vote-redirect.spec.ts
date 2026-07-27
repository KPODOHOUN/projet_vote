import { expect, test } from "@playwright/test";

test("legacy vote URL redirects to public event page", async ({ page }) => {
  const eventSlug = "e2e-legacy-redirect";
  await page.goto(`/vote/demo-tenant/${eventSlug}`);
  await expect(page).toHaveURL(new RegExp(`/e/${eventSlug}$`));
});

test("vote entry accepts contest code", async ({ page }) => {
  await page.goto("/vote");
  await expect(page.getByRole("heading", { name: "Accéder à un évènement" })).toBeVisible();
});
