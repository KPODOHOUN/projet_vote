import { test } from "node:test";
import * as assert from "node:assert/strict";
import { EDGE_CLIENT_IP_HEADER, EDGE_SECRET_HEADER, trustedEdgeClientIp } from "./edge-client-ip";

const SECRET = "s".repeat(40);

test("l'IP relayée par le front n'est crue qu'avec le secret partagé", () => {
  assert.equal(trustedEdgeClientIp({ [EDGE_SECRET_HEADER]: SECRET, [EDGE_CLIENT_IP_HEADER]: "41.85.10.2" }, SECRET), "41.85.10.2");
  assert.equal(trustedEdgeClientIp({ [EDGE_SECRET_HEADER]: SECRET, [EDGE_CLIENT_IP_HEADER]: " 2001:db8::1 " }, SECRET), "2001:db8::1");
  assert.equal(trustedEdgeClientIp({ [EDGE_SECRET_HEADER]: "x".repeat(40), [EDGE_CLIENT_IP_HEADER]: "1.2.3.4" }, SECRET), null);
  assert.equal(trustedEdgeClientIp({ [EDGE_CLIENT_IP_HEADER]: "1.2.3.4" }, SECRET), null);
  assert.equal(trustedEdgeClientIp({ [EDGE_SECRET_HEADER]: SECRET, [EDGE_CLIENT_IP_HEADER]: "1.2.3.4" }, undefined), null);
  assert.equal(trustedEdgeClientIp({ [EDGE_SECRET_HEADER]: SECRET, [EDGE_CLIENT_IP_HEADER]: "pas-une-ip" }, SECRET), null);
});
