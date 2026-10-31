import { test, after } from "node:test";
import * as assert from "node:assert/strict";
import { apiFetch, ApiError } from "./api";
import { accessTokenExpiry } from "./auth";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function jwt(exp: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ exp })}.sig`;
}

test("jeton expiré : la session est rafraîchie et la requête rejouée une fois, en-têtes intacts", async () => {
  const calls: { url: string; auth: string | null; contentType: string | null; body: unknown }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url: String(url), auth: headers.get("authorization"), contentType: headers.get("content-type"), body: init.body });
    if (String(url).endsWith("/auth/refresh")) return new Response(JSON.stringify({ accessToken: "nouveau" }), { status: 201 });
    if (headers.get("authorization") === "Bearer ancien") return new Response(JSON.stringify({ message: "Session expirée" }), { status: 401 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const result = await apiFetch<{ ok: boolean }>("/events/x/design", { method: "PUT", headers: { Authorization: "Bearer ancien" }, body: "{\"a\":1}" });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2]!.auth, "Bearer nouveau");
  assert.equal(calls[2]!.contentType, "application/json", "un seul Content-Type");
  assert.equal(calls[2]!.body, "{\"a\":1}");
});

test("refresh impossible : l'erreur 401 d'origine remonte ; sans jeton ou sur /auth, aucun rejeu", async () => {
  let count = 0;
  globalThis.fetch = (async () => { count += 1; return new Response(JSON.stringify({ message: "non" }), { status: 401 }); }) as typeof fetch;
  await assert.rejects(apiFetch("/events", { headers: { Authorization: "Bearer ancien" } }), (e: unknown) => e instanceof ApiError && e.status === 401);
  assert.equal(count, 2, "requête + refresh, pas de rejeu");
  count = 0;
  await assert.rejects(apiFetch("/votes/cast", { method: "POST" }));
  await assert.rejects(apiFetch("/auth/login", { method: "POST", headers: { Authorization: "Bearer x" } }));
  assert.equal(count, 2);
});

test("échéance du jeton lue pour le renouvellement anticipé", () => {
  assert.equal(accessTokenExpiry(jwt(1_900_000_000)), 1_900_000_000_000);
  assert.equal(accessTokenExpiry("pas.un-jeton"), null);
});
