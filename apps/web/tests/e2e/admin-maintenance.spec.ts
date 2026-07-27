import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
});

test("maintenance: affiche le mode inactif puis active", async ({ page }) => {
  let enabled = false;

  await page.route("**/api/v1/admin/maintenance/mode", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled,
          message: enabled
            ? "Maintenance en cours."
            : "La plateforme est momentanément indisponible pour maintenance."
        })
      });
      return;
    }
    if (route.request().method() === "PUT") {
      enabled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          message: "Maintenance en cours."
        })
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/admin/maintenance");
  await expect(page.getByRole("heading", { name: "Mode maintenance" })).toBeVisible();
  await expect(page.getByText("INACTIF")).toBeVisible();

  await page.getByRole("button", { name: "Activer la maintenance" }).click();
  await expect(page.getByText("ACTIF")).toBeVisible();
});

test("maintenance publique: bannière visible quand activé", async ({ page }) => {
  await page.route("**/api/v1/maintenance/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        message: "Maintenance planifiée — retour sous 30 minutes."
      })
    });
  });

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Unauthorized" }) });
  });

  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Maintenance planifiée");
});
