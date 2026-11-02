import test from "node:test";
import * as assert from "node:assert/strict";
import { envSchema } from "./env";

const PRODUCTION_BASE = {
  NODE_ENV: "production",
  API_JWT_SECRET: "prod-jwt-secret-0123456789abcdef0123456789",
  API_ORGANIZER_SECRET_KEY: "prod-organizer-key-0123456789abcdef012345",
  API_VAULT_SECRET_KEY: "prod-vault-key-0123456789abcdef0123456789",
  API_MAINTENANCE_CRON_SECRET: "prod-cron-secret-0123456789abcdef01234567",
  API_OPS_TOKEN: "prod-ops-token-0123456789abcdef0123456789",
  DEFAULT_PSP_PROVIDER: "FEEXPAY",
  FEEXPAY_API_KEY: "fp_live_key_0123456789abcdef",
  FEEXPAY_SHOP_ID: "shop-123",
  MAIL_RESEND_API_KEY: "re_test_key",
  API_EDGE_PROXY_SECRET: "prod-edge-secret-0123456789abcdef0123456",
  API_REDIS_URL: "redis://localhost:6379"
};

function productionIssuePaths(overrides: Record<string, string | undefined>): string[] {
  const result = envSchema.safeParse({ ...process.env, ...PRODUCTION_BASE, ...overrides });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

test("env: une configuration de production complète est acceptée", () => {
  assert.deepEqual(productionIssuePaths({}), []);
});

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

test("env: API_PAYMENT_DEMO_MODE=false est bien lu comme faux (production démarre)", () => {
  assert.deepEqual(productionIssuePaths({ API_PAYMENT_DEMO_MODE: "false" }), []);
  assert.deepEqual(productionIssuePaths({ API_PAYMENT_DEMO_MODE: "0" }), []);
});

test("env: API_PAYMENT_DEMO_MODE=true est refusé en production", () => {
  assert.ok(productionIssuePaths({ API_PAYMENT_DEMO_MODE: "true" }).includes("API_PAYMENT_DEMO_MODE"));
});

test("env: hors production, les drapeaux booléens respectent leur valeur", () => {
  const parse = (value: string | undefined) =>
    envSchema.parse({ ...process.env, NODE_ENV: "development", API_PAYMENT_DEMO_MODE: value }).API_PAYMENT_DEMO_MODE;
  assert.equal(parse("false"), false);
  assert.equal(parse("FALSE"), false);
  assert.equal(parse(""), false);
  assert.equal(parse(undefined), false);
  assert.equal(parse("true"), true);
  assert.equal(parse("1"), true);
});

test("env: une valeur booléenne invalide est refusée plutôt que devinée", () => {
  const result = envSchema.safeParse({ ...process.env, NODE_ENV: "development", API_PAYMENT_DEMO_MODE: "oui" });
  assert.equal(result.success, false);
});

test("env: API_DISABLE_THROTTLE est refusé en production", () => {
  assert.ok(productionIssuePaths({ API_DISABLE_THROTTLE: "1" }).includes("API_DISABLE_THROTTLE"));
});

test("env: en production sans Redis, il faut déclarer une instance unique", () => {
  assert.ok(productionIssuePaths({ API_REDIS_URL: undefined }).includes("API_REDIS_URL"));
  assert.deepEqual(productionIssuePaths({ API_REDIS_URL: undefined, API_SINGLE_INSTANCE: "true" }), []);
});

test("env: en production, sans secret de relais du front, le démarrage est refusé", () => {
  assert.ok(productionIssuePaths({ API_EDGE_PROXY_SECRET: undefined }).includes("API_EDGE_PROXY_SECRET"));
});
