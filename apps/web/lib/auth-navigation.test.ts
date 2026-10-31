import { test } from "node:test";
import * as assert from "node:assert/strict";
import { authModalUrl, isSafeInternalPath, sanitizeAuthReturnTo } from "./auth-navigation";

test("retour après connexion : un chemin interne est conservé", () => {
  assert.equal(sanitizeAuthReturnTo("/dashboard/events?tab=1"), "/dashboard/events?tab=1");
  assert.equal(sanitizeAuthReturnTo("/e/miss-campus"), "/e/miss-campus");
});

test("retour après connexion : aucune URL qui sort du site", () => {
  for (const next of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "https://evil.com", "evil.com", "/%0d%0a", ""]) {
    assert.equal(isSafeInternalPath(next), next === "/%0d%0a", JSON.stringify(next));
  }
  assert.equal(sanitizeAuthReturnTo("/\\evil.com"), null);
  assert.equal(sanitizeAuthReturnTo("/login?x=1"), null);
});

test("le lien de connexion n'emporte jamais un retour externe", () => {
  assert.equal(authModalUrl("login", "/\\evil.com"), "/?auth=login");
  assert.equal(authModalUrl("login", "/dashboard"), "/?auth=login&next=%2Fdashboard");
});
