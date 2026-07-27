import "reflect-metadata";
import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { KkiapayGateway } from "./kkiapay.gateway";
import type { PspCredentials } from "./psp.types";

// KkiaPay verifies server-side with all three keys; the shop field is unused.
const creds: PspCredentials = { apiKey: "unused", shop: "" };
const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { status, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.KKIAPAY_BASE_URL = "https://api-sandbox.kkiapay.me";
  process.env.KKIAPAY_PUBLIC_KEY = "pub_test";
  process.env.KKIAPAY_PRIVATE_KEY = "prv_test";
  process.env.KKIAPAY_SECRET_KEY = "sec_test";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("initPayin is a server-side no-op: echoes the front-supplied transactionId as reference", async () => {
  // KkiaPay payin is initiated by the JS widget on the client; the server never
  // calls an init endpoint. We must NOT hit the network here.
  mockFetch(() => {
    throw new Error("initPayin must not perform any HTTP call");
  });
  const gw = new KkiapayGateway();
  const res = await gw.initPayin(
    { amountCfa: 100, phoneNumber: "+22997000000", operator: "MTN", customId: "kkia-tx-1" },
    creds
  );
  assert.equal(res.reference, "kkia-tx-1");
  assert.equal(res.status, "PENDING");
  assert.equal(res.amountCfa, 100);
});

test("initPayin without a customId throws (no transactionId to track)", async () => {
  const gw = new KkiapayGateway();
  await assert.rejects(
    () => gw.initPayin({ amountCfa: 100, phoneNumber: "+229", operator: "MTN" }, creds),
    /transactionId/i
  );
});

test("fetchPayinStatus posts {transactionId} with the three keys; SUCCESS → SUCCEEDED", async () => {
  let seen: { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  mockFetch((url, init) => {
    seen = {
      url,
      method: init.method!,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body))
    };
    return { status: 200, body: { status: "SUCCESS", amount: 100 } };
  });
  const gw = new KkiapayGateway();
  const res = await gw.fetchPayinStatus("kkia-tx-1", creds);
  assert.equal(res.status, "SUCCEEDED");
  assert.equal(res.amountCfa, 100);
  assert.equal(seen!.url, "https://api-sandbox.kkiapay.me/api/v1/transactions/status");
  assert.equal(seen!.method, "POST");
  assert.equal(seen!.headers["x-api-key"], "pub_test");
  assert.equal(seen!.headers["x-private-key"], "prv_test");
  assert.equal(seen!.headers["x-secret-key"], "sec_test");
  assert.equal(seen!.body.transactionId, "kkia-tx-1");
});

test("fetchPayinStatus utilise les clés des credentials plutôt que l'env", async () => {
  let captured: Record<string, string> = {};
  mockFetch((_url, init) => {
    captured = init.headers as Record<string, string>;
    return { status: 200, body: { status: "SUCCESS", amount: 500, currency: "XOF" } };
  });
  const gw = new KkiapayGateway();
  await gw.fetchPayinStatus("tx_1", {
    apiKey: "",
    shop: "",
    kkiapayPublicKey: "orga_pub",
    kkiapayPrivateKey: "orga_priv",
    kkiapaySecretKey: "orga_sec"
  });
  assert.equal(captured["x-api-key"], "orga_pub");
  assert.equal(captured["x-private-key"], "orga_priv");
  assert.equal(captured["x-secret-key"], "orga_sec");
});

test("fetchPayinStatus maps FAILED / INSUFFICIENT_FUND / NOT_FOUND → FAILED", async () => {
  for (const raw of ["FAILED", "INSUFFICIENT_FUND", "TRANSACTION_NOT_FOUND"]) {
    mockFetch(() => ({ status: 200, body: { status: raw } }));
    const gw = new KkiapayGateway();
    const res = await gw.fetchPayinStatus("x", creds);
    assert.equal(res.status, "FAILED", `expected FAILED for ${raw}`);
  }
});

test("sendPayout always returns UNCERTAIN (KkiaPay payout is not a per-organizer transfer)", async () => {
  mockFetch(() => {
    throw new Error("sendPayout must not call KkiaPay's schedule endpoint");
  });
  const gw = new KkiapayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k", amountCfa: 100, beneficiaryAccount: "+229", network: "MTN", label: "x" },
    creds
  );
  assert.equal(res.status, "UNCERTAIN");
  assert.match((res as { reason: string }).reason, /kkiapay/i);
});

test("fetchPayoutStatus stays non-terminal PENDING (no unitary payout to track)", async () => {
  const gw = new KkiapayGateway();
  const res = await gw.fetchPayoutStatus("whatever", creds);
  assert.equal(res.status, "PENDING"); // normalized status result requires a tri-state; treat as not-resolved
  assert.match(String(res.reason), /kkiapay/i);
});

test("getBalance returns {} (no documented balance endpoint)", async () => {
  const gw = new KkiapayGateway();
  assert.deepEqual(await gw.getBalance(creds), {});
});
