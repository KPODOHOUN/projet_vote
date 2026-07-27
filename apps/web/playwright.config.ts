import { defineConfig, devices } from "@playwright/test";

const useManualServers = process.env.PW_MANUAL_SERVERS === "1";
process.env.E2E_API_BASE_URL ??= "http://127.0.0.1:3011/api/v1";

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
    baseURL: "http://127.0.0.1:3100",
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
              "npm --prefix ../../packages/shared run build && npm --prefix ../../packages/db run build && npm --prefix ../api run build && API_DISABLE_THROTTLE=1 PORT=3011 npm --prefix ../api run start",
            url: "http://127.0.0.1:3011/api/v1/health/ready",
            reuseExistingServer: false,
            timeout: 120000
          },
          {
            command:
              "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3011/api/v1 npm run build && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3011/api/v1 npm run start -- -p 3100",
            url: "http://127.0.0.1:3100",
            reuseExistingServer: false,
            timeout: 120000
          }
        ]
      })
});
