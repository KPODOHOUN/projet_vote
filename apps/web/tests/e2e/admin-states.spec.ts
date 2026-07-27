import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("vp.organizer.token", "fake-token");
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "u1",
        tenantId: "t1",
        role: "PLATFORM_ADMIN",
        email: "admin@shadowa.test"
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
});

test("admin users: états loading + empty", async ({ page }) => {
  await page.route("**/api/v1/admin/users**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        nextCursor: null
      })
    });
  });

  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Aucun utilisateur" })).toBeVisible();
});

test("admin feature flags: état error", async ({ page }) => {
  await page.route("**/api/v1/admin/feature-flags**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Erreur backend simulée"
      })
    });
  });

  await page.goto("/admin/feature-flags");
  await expect(page.getByText("Erreur backend simulée")).toBeVisible();
});

test("admin jobs: état empty", async ({ page }) => {
  await page.route("**/api/v1/admin/jobs/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pendingPayments: 0,
        stalePendingPayments: 0,
        failedPayments24h: 0,
        expiredIdempotencyKeys: 0,
        revokedSessionsToPurge: 0,
        recentMaintenanceRuns: []
      })
    });
  });

  await page.goto("/admin/jobs");
  await expect(page.getByText("Aucune exécution de maintenance récente.")).toBeVisible();
});
