import test from "node:test";
import * as assert from "node:assert/strict";
import { envSchema } from "./env";

function productionIssuePaths(overrides: Record<string, string | undefined>): string[] {
  const result = envSchema.safeParse({ ...process.env, NODE_ENV: "production", ...overrides });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

test("env: en production, MAIL_RESEND_API_KEY absente empêche le démarrage", () => {
  assert.ok(productionIssuePaths({ MAIL_RESEND_API_KEY: "" }).includes("MAIL_RESEND_API_KEY"));
});

test("env: en production, une MAIL_RESEND_API_KEY renseignée n'est pas signalée", () => {
  assert.ok(!productionIssuePaths({ MAIL_RESEND_API_KEY: "re_test_key" }).includes("MAIL_RESEND_API_KEY"));
});

test("env: hors production, la clé reste optionnelle", () => {
  const result = envSchema.safeParse({ ...process.env, NODE_ENV: "test", MAIL_RESEND_API_KEY: "" });
  assert.ok(result.success);
});
