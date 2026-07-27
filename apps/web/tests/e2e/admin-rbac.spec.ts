import { expect, test } from "@playwright/test";

test.describe("RBAC admin", () => {
  test("organisateur redirigé hors de /admin", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("vp.organizer.token", "organizer-token");
    });

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u-org",
          tenantId: "t-org",
          role: "ORGANIZER_OWNER",
          email: "org@example.test"
        })
      });
    });

    await page.route("**/api/v1/notifications**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], unreadCount: 0 })
      });
    });

    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test("admin plateforme accède à /admin/votes", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("vp.organizer.token", "admin-token");
    });

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u-admin",
          tenantId: "t-platform",
          role: "PLATFORM_ADMIN",
          email: "admin@shadoma.test"
        })
      });
    });

    await page.route("**/api/v1/notifications**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], unreadCount: 0 })
      });
    });

    await page.route("**/api/v1/partners/admin/requests/pending-count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 0 })
      });
    });

    await page.route("**/api/v1/admin/platform/votes**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], nextCursor: null })
      });
    });

    await page.goto("/admin/votes");
    await expect(page.getByRole("heading", { name: "Modération des votes" })).toBeVisible();
    await expect(page.getByText("Aucun vote")).toBeVisible();
  });
});
