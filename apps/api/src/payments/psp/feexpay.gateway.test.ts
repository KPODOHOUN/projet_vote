import "reflect-metadata";
import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { FeexpayGateway } from "./feexpay.gateway";
import type { PspCredentials } from "./psp.types";

const creds: PspCredentials = { apiKey: "test_abc_key_1234567890", shop: "shop-1" };
const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { status, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.FEEXPAY_BASE_URL = "https://api-v2.feexpay.me";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("initPayin → normalized PENDING + reference, posts Bearer + shop + amount", async () => {
  let seen: { url: string; auth: string; body: Record<string, unknown> } | null = null;
  mockFetch((url, init) => {
    seen = {
      url,
      auth: (init.headers as Record<string, string>).Authorization ?? "",
      body: JSON.parse(String(init.body))
    };
    return { status: 200, body: { reference: "fp-ref-1", status: "PENDING", amount: 100 } };
  });
  const gw = new FeexpayGateway();
  const res = await gw.initPayin(
    { amountCfa: 100, phoneNumber: "2290166000000", operator: "MTN", customId: "tx1" },
    creds
  );
  assert.equal(res.reference, "fp-ref-1");
  assert.equal(res.status, "PENDING");
  assert.equal(res.amountCfa, 100);
  assert.equal(seen!.url, "https://api-v2.feexpay.me/api/transactions/public/requesttopay/mtn");
  assert.equal(seen!.auth, "Bearer test_abc_key_1234567890");
  assert.equal(seen!.body.shop, "shop-1");
  assert.equal(seen!.body.amount, 100);
});

test("fetchPayinStatus → maps SUCCESSFUL to SUCCEEDED, coerces string amount", async () => {
  mockFetch(() => ({
    status: 200,
    body: { status: "SUCCESSFUL", amount: "100", currency: "XOF" }
  }));
  const gw = new FeexpayGateway();
  const res = await gw.fetchPayinStatus("fp-ref-1", creds);
  assert.equal(res.status, "SUCCEEDED");
  assert.equal(res.amountCfa, 100);
  assert.equal(res.currency, "XOF");
});

test("sendPayout SUCCESSFUL → SUCCEEDED + providerRef", async () => {
  mockFetch((url, init) => {
    assert.equal(url, "https://api-v2.feexpay.me/api/payouts/public/transfer/global");
    const body = JSON.parse(String(init.body));
    assert.equal(body.network, "MTN");
    assert.equal(body.shop, "shop-1");
    return { status: 200, body: { reference: "po-ref-1", status: "SUCCESSFUL" } };
  });
  const gw = new FeexpayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k1", amountCfa: 100, beneficiaryAccount: "2290166000000", network: "MTN", label: "x" },
    creds
  );
  assert.deepEqual(res, { status: "SUCCEEDED", providerRef: "po-ref-1" });
});

test("sendPayout on 5xx → UNCERTAIN (never auto-succeed)", async () => {
  mockFetch(() => ({ status: 503, body: { message: "down" } }));
  const gw = new FeexpayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k1", amountCfa: 100, beneficiaryAccount: "2290166000000", network: "MTN", label: "x" },
    creds
  );
  assert.equal(res.status, "UNCERTAIN");
});

test("fetchPayoutStatus → normalized SUCCEEDED", async () => {
  mockFetch(() => ({
    status: 200,
    body: { reference: "po-ref-1", reseau: "MTN", amount: 50, status: "SUCCESSFUL", description: "x" }
  }));
  const gw = new FeexpayGateway();
  const res = await gw.fetchPayoutStatus("po-ref-1", creds);
  assert.equal(res.status, "SUCCEEDED");
  assert.equal(res.amountCfa, 50);
});
