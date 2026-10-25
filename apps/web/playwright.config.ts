import { defineConfig, devices } from "@playwright/test";

const useManualServers = process.env.PW_MANUAL_SERVERS === "1";
// Port du site Next de test ; E2E_WEB_PORT si 3100 est déjà pris sur la machine.
const webPort = process.env.E2E_WEB_PORT ?? "3100";
process.env.E2E_API_BASE_URL ??= "http://127.0.0.1:3011/api/v1";

// Base dédiée aux e2e (convention identique au script `npm test` de l'API).
// Surcharge le DATABASE_URL du .env racine chargé par apps/api/src/config/env.ts
// afin que les specs ne polluent jamais la base de développement.
const e2eDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://votezpro:votezpro_dev@localhost:5433/votezpro_test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    storageState: {
      cookies: [
        {
          name: "vp_cookie_consent",
          value: "%7B%22necessary%22%3Atrue%2C%22analytics%22%3Afalse%2C%22marketing%22%3Afalse%7D",
          domain: "127.0.0.1",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 31_536_000,
          httpOnly: false,
          secure: false,
          sameSite: "Lax"
        }
      ],
      origins: []
    }
  },
  ...(useManualServers
    ? {}
    : {
        webServer: [
          {
            command:
              // NODE_ENV=test : register auto-vérifie l'email et renvoie les tokens
              // directement (convention du script `npm test` de l'API) — les specs
              // n'ont pas à passer par le challenge OTP.
              // API_CORS_ORIGINS : en NODE_ENV=test, main.ts n'autorise que localhost:3000
              // (le wildcard n'existe qu'en development) — sans ça, les fetchs navigateur
              // 3100 → 3011 (login, maintenance…) sont bloqués par le preflight CORS.
              `export NODE_ENV=test DATABASE_URL="${e2eDatabaseUrl}" MAIL_RESEND_API_KEY= API_DISABLE_THROTTLE=1 API_CORS_ORIGINS="http://127.0.0.1:${webPort},http://localhost:${webPort}" && ` +
              "npm --prefix ../../packages/shared run build && npm --prefix ../../packages/db run build && npm --prefix ../api run build && " +
              // migrate deploy, comme en production : le drift schema/migrations est
              // nul (prisma migrate diff sur base vierge, 2026-10-25).
              "npx prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma && " +
              "PORT=3011 npm --prefix ../api run start",
            url: "http://127.0.0.1:3011/api/v1/health/ready",
            reuseExistingServer: false,
            // Builds à froid du monorepo (shared → db → nest build) + migrate deploy :
            // 2 min ne suffisent pas sur machine de dev.
            timeout: 300000
          },
          {
            // NEXT_PUBLIC_API_BASE_URL : fetchs côté client/navigateur.
            // API_BASE_URL : rewrite /api/v1/* de next.config.ts (défaut 3001) —
            // sans elle, le proxy SSR tombe sur un port sans API (ECONNREFUSED).
            command:
              "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3011/api/v1 API_BASE_URL=http://127.0.0.1:3011 npm run build && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3011/api/v1 API_BASE_URL=http://127.0.0.1:3011 npm run start -- -p " + webPort,
            url: `http://127.0.0.1:${webPort}`,
            reuseExistingServer: false,
            timeout: 300000
          }
        ]
      })
});
