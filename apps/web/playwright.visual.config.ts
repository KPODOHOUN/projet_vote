import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Captures de validation visuelle (Lot H2) : même serveurs que l'e2e, projet
// séparé, jamais lancé par `npx playwright test` (testDir distinct).
export default defineConfig({
  ...base,
  testDir: "./tests/visual",
  retries: 0,
  projects: [{ name: "visual", use: { browserName: "chromium" } }]
});
