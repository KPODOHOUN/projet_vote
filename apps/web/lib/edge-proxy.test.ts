import { test } from "node:test";
import * as assert from "node:assert/strict";
import { edgeProxyHeaders, forwardedIpIsTrusted, visitorIp } from "./edge-proxy";

test("IP du visiteur relayée seulement chez un hébergeur qui réécrit les en-têtes", () => {
  assert.equal(forwardedIpIsTrusted({ VERCEL: "1" }), true);
  assert.equal(forwardedIpIsTrusted({ EDGE_TRUST_FORWARDED_IP: "true" }), true);
  assert.equal(forwardedIpIsTrusted({}), false);
  assert.deepEqual(edgeProxyHeaders("41.85.10.2", "s".repeat(40), true), { "x-shadoma-edge-secret": "s".repeat(40), "x-shadoma-client-ip": "41.85.10.2" });
  assert.deepEqual(edgeProxyHeaders("41.85.10.2", "s".repeat(40), false), {});
  assert.deepEqual(edgeProxyHeaders("41.85.10.2", undefined, true), {});
});

test("IP lue dans x-real-ip, sinon la première entrée de x-forwarded-for", () => {
  assert.equal(visitorIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(visitorIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })), "5.6.7.8");
  assert.equal(visitorIp(new Headers()), null);
});
