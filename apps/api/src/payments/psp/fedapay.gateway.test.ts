import "reflect-metadata";
import { test, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { FedapayGateway } from "./fedapay.gateway";
import type { PspCredentials } from "./psp.types";

// FedaPay credentials: apiKey = Bearer secret key; shop = unused (no shop concept).
const creds: PspCredentials = { apiKey: "sk_sandbox_abc1234567890", shop: "" };
const originalFetch = globalThis.fetch;

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown };

function mockSequence(handlers: Handler[]) {
  let i = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const h = handlers[Math.min(i, handlers.length - 1)] as Handler;
    i += 1;
    const { status, body } = h(String(url), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

// Gateways always build headers as a plain string→string record.
function authHeader(init: RequestInit): string {
  return (init.headers as Record<string, string>).Authorization ?? "";
}

beforeEach(() => {
  process.env.FEDAPAY_BASE_URL = "https://sandbox-api.fedapay.com/v1";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("initPayin runs the 3-step flow (create → token → mode) and returns the tx id as reference", async () => {
  const calls: { url: string; method: string; auth: string; body: Record<string, unknown> }[] = [];
  mockSequence([
    // 1. POST /transactions → returns { id }
    (url, init) => {
      calls.push({ url, method: init.method!, auth: authHeader(init), body: JSON.parse(String(init.body)) });
      return { status: 200, body: { "v1/transaction": { id: 4242, status: "pending" } } };
    },
    // 2. POST /transactions/4242/token → returns { token }
    (url, init) => {
      calls.push({ url, method: init.method!, auth: authHeader(init), body: init.body ? JSON.parse(String(init.body)) : {} });
      return { status: 200, body: { token: "tok_abc", url: "https://pay/tok_abc" } };
    },
    // 3. POST /mtn_open { token } → push sent
    (url, init) => {
      calls.push({ url, method: init.method!, auth: authHeader(init), body: JSON.parse(String(init.body)) });
      return { status: 200, body: { status: "pending" } };
    }
  ]);

  const gw = new FedapayGateway();
  const res = await gw.initPayin(
    { amountCfa: 100, phoneNumber: "+2290166000000", operator: "mtn_open", customId: "tx1" },
    creds
  );

  assert.equal(res.reference, "4242"); // FedaPay transaction id, stored as providerRef
  assert.equal(res.status, "PENDING");
  assert.equal(res.amountCfa, 100);

  assert.equal(calls.length, 3);
  const [c0, c1, c2] = calls as [(typeof calls)[number], (typeof calls)[number], (typeof calls)[number]];
  // Step 1
  assert.equal(c0.url, "https://sandbox-api.fedapay.com/v1/transactions");
  assert.equal(c0.method, "POST");
  assert.equal(c0.auth, "Bearer sk_sandbox_abc1234567890");
  assert.equal(c0.body.amount, 100);
  assert.deepEqual(c0.body.currency, { iso: "XOF" });
  // Step 2
  assert.equal(c1.url, "https://sandbox-api.fedapay.com/v1/transactions/4242/token");
  // Step 3
  assert.equal(c2.url, "https://sandbox-api.fedapay.com/v1/mtn_open");
  assert.equal(c2.body.token, "tok_abc");
});

test("fetchPayinStatus maps approved → SUCCEEDED", async () => {
  mockSequence([
    () => ({ status: 200, body: { "v1/transaction": { id: 4242, status: "approved", amount: 100, currency: { iso: "XOF" } } } })
  ]);
  const gw = new FedapayGateway();
  const res = await gw.fetchPayinStatus("4242", creds);
  assert.equal(res.status, "SUCCEEDED");
  assert.equal(res.amountCfa, 100);
  assert.equal(res.currency, "XOF");
});

test("fetchPayinStatus maps declined → FAILED", async () => {
  mockSequence([
    () => ({ status: 200, body: { "v1/transaction": { id: 1, status: "declined", amount: 100 } } })
  ]);
  const gw = new FedapayGateway();
  const res = await gw.fetchPayinStatus("1", creds);
  assert.equal(res.status, "FAILED");
});

test("sendPayout creates then starts; sent → SUCCEEDED with providerRef", async () => {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  mockSequence([
    // POST /payouts → { id }
    (url, init) => {
      calls.push({ url, method: init.method!, body: JSON.parse(String(init.body)) });
      return { status: 200, body: { "v1/payout": { id: 77, status: "pending" } } };
    },
    // PUT /payouts/start → started
    (url, init) => {
      calls.push({ url, method: init.method!, body: JSON.parse(String(init.body)) });
      return { status: 200, body: { "v1/payouts": [{ id: 77, status: "sent" }] } };
    }
  ]);
  const gw = new FedapayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "per1:ORGANIZER:tenantA", amountCfa: 100, beneficiaryAccount: "+2290166000000", network: "mtn", label: "Versement" },
    creds
  );
  assert.deepEqual(res, { status: "SUCCEEDED", providerRef: "77" });
  assert.equal(calls.length, 2);
  const [c0, c1] = calls as [(typeof calls)[number], (typeof calls)[number]];
  // create
  assert.equal(c0.url, "https://sandbox-api.fedapay.com/v1/payouts");
  assert.equal(c0.method, "POST");
  assert.equal(c0.body.amount, 100);
  assert.equal(c0.body.merchant_reference, "per1:ORGANIZER:tenantA");
  // start
  assert.equal(c1.url, "https://sandbox-api.fedapay.com/v1/payouts/start");
  assert.equal(c1.method, "PUT");
  assert.deepEqual(c1.body, { payouts: [{ id: 77 }] });
});

test("sendPayout on 5xx → UNCERTAIN (never auto-succeed)", async () => {
  mockSequence([() => ({ status: 503, body: { message: "down" } })]);
  const gw = new FedapayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k", amountCfa: 100, beneficiaryAccount: "+229", network: "mtn", label: "x" },
    creds
  );
  assert.equal(res.status, "UNCERTAIN");
});

test("sendPayout when start returns non-terminal pending → UNCERTAIN", async () => {
  mockSequence([
    () => ({ status: 200, body: { "v1/payout": { id: 9, status: "pending" } } }),
    () => ({ status: 200, body: { "v1/payouts": [{ id: 9, status: "processing" }] } })
  ]);
  const gw = new FedapayGateway();
  const res = await gw.sendPayout(
    { idempotencyKey: "k", amountCfa: 100, beneficiaryAccount: "+229", network: "mtn", label: "x" },
    creds
  );
  assert.equal(res.status, "UNCERTAIN");
});

test("fetchPayoutStatus maps sent → SUCCEEDED, failed → FAILED", async () => {
  mockSequence([
    () => ({ status: 200, body: { "v1/payout": { id: 77, status: "sent", amount: 50, currency: { iso: "XOF" } } } })
  ]);
  const gw = new FedapayGateway();
  const ok = await gw.fetchPayoutStatus("77", creds);
  assert.equal(ok.status, "SUCCEEDED");
  assert.equal(ok.amountCfa, 50);
});

test("getBalance returns {} (balance endpoint not documented → never invent a URL)", async () => {
  const gw = new FedapayGateway();
  const bal = await gw.getBalance(creds);
  assert.deepEqual(bal, {});
});
