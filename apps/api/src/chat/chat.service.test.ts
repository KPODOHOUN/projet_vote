import test from "node:test";
import * as assert from "node:assert/strict";
import { ZodError } from "zod";
import { env } from "../config/env";
import { CHAT_SYSTEM_PROMPT, ChatService } from "./chat.service";
import { RedisChatQuotaStore } from "./chat-quota";

type FetchCall = { url: string; body: Record<string, unknown> };

function withFakeOpenAi(run: (calls: FetchCall[]) => Promise<void>) {
  return async () => {
    const calls: FetchCall[] = [];
    const originalFetch = globalThis.fetch;
    const originalKey = env.OPENAI_API_KEY;
    env.OPENAI_API_KEY = "sk-test-not-real";
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: JSON.parse(init?.body ?? "{}") as Record<string, unknown> });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      await run(calls);
    } finally {
      globalThis.fetch = originalFetch;
      env.OPENAI_API_KEY = originalKey;
    }
  };
}

test("chat: rejette un message vide, trop long ou non textuel", withFakeOpenAi(async (calls) => {
  const chat = new ChatService();
  await assert.rejects(chat.chat({ message: "   " }, "1.1.1.1"), ZodError);
  await assert.rejects(chat.chat({ message: "x".repeat(501) }, "1.1.1.1"), ZodError);
  await assert.rejects(chat.chat({ message: 42 }, "1.1.1.1"), ZodError);
  await assert.rejects(chat.chat(undefined, "1.1.1.1"), ZodError);
  assert.equal(calls.length, 0);
}));

test("chat: un message valide part avec max_tokens borné", withFakeOpenAi(async (calls) => {
  const chat = new ChatService();
  assert.equal(await chat.chat({ message: "Comment voter ?" }, "1.1.1.1"), "ok");
  assert.equal(calls.length, 1);
  assert.ok(Number(calls[0]!.body.max_tokens) <= 300);
}));

test("chat: plafond journalier par IP puis global", withFakeOpenAi(async (calls) => {
  const previous = { perIp: env.CHAT_DAILY_LIMIT_PER_IP, global: env.CHAT_DAILY_LIMIT };
  env.CHAT_DAILY_LIMIT_PER_IP = 2;
  env.CHAT_DAILY_LIMIT = 3;
  try {
    const chat = new ChatService();
    await chat.chat({ message: "a" }, "2.2.2.2");
    await chat.chat({ message: "b" }, "2.2.2.2");
    await assert.rejects(chat.chat({ message: "c" }, "2.2.2.2"), (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 429);
    await chat.chat({ message: "d" }, "3.3.3.3");
    await assert.rejects(chat.chat({ message: "e" }, "4.4.4.4"), (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 429);
    assert.equal(calls.length, 3);
  } finally {
    env.CHAT_DAILY_LIMIT_PER_IP = previous.perIp;
    env.CHAT_DAILY_LIMIT = previous.global;
  }
}));

test("chat: sans clé, l'assistant est désactivé et refuse en 503", async () => {
  const originalKey = env.OPENAI_API_KEY;
  env.OPENAI_API_KEY = undefined;
  try {
    const chat = new ChatService();
    assert.equal(chat.isEnabled(), false);
    await assert.rejects(chat.chat({ message: "Bonjour" }, "1.1.1.1"), (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 503);
  } finally {
    env.OPENAI_API_KEY = originalKey;
  }
});

test("chat: le prompt système ne promet rien que le produit ne fait pas", () => {
  const forbidden = [
    /sebpay/i,
    /automatique/i,
    /gratuit/i,
    /en un jour/i,
    /\d+\s*%/,
    /\d+\s*h\b/i,
    /\d+\s*(heures?|jours?|minutes?)/i,
    /virement instantané/i,
    /billet/i,
    /@shadowa\./i,
    /orange money|mtn|moov/i
  ];
  const hits = forbidden.filter((re) => re.test(CHAT_SYSTEM_PROMPT)).map(String);
  assert.deepEqual(hits, []);
  // Le flux réel doit être décrit.
  assert.match(CHAT_SYSTEM_PROMPT, /Mobile Money/);
  assert.match(CHAT_SYSTEM_PROMPT, /confirm/);
  assert.match(CHAT_SYSTEM_PROMPT, /valid/);
});

test("chat: avec Redis, les plafonds sont partagés entre instances (clé par jour, expiration posée)", withFakeOpenAi(async (calls) => {
  const counters = new Map<string, number>();
  const expiries = new Map<string, number>();
  const fakeRedis = {
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async decr(key: string) {
      const next = (counters.get(key) ?? 0) - 1;
      counters.set(key, next);
      return next;
    },
    async expire(key: string, seconds: number) {
      expiries.set(key, seconds);
      return 1;
    }
  };
  const previous = { perIp: env.CHAT_DAILY_LIMIT_PER_IP, global: env.CHAT_DAILY_LIMIT };
  env.CHAT_DAILY_LIMIT_PER_IP = 1;
  env.CHAT_DAILY_LIMIT = 10;
  try {
    // Deux instances de l'API, un seul Redis.
    const a = new ChatService(new RedisChatQuotaStore(fakeRedis));
    const b = new ChatService(new RedisChatQuotaStore(fakeRedis));
    await a.chat({ message: "a" }, "5.5.5.5");
    await assert.rejects(b.chat({ message: "b" }, "5.5.5.5"), (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 429);
    assert.equal(calls.length, 1);
    const day = new Date().toISOString().slice(0, 10);
    assert.ok([...counters.keys()].every((k) => k.includes(day)));
    assert.ok([...expiries.values()].every((s) => s > 0 && s <= 2 * 86_400));
  } finally {
    env.CHAT_DAILY_LIMIT_PER_IP = previous.perIp;
    env.CHAT_DAILY_LIMIT = previous.global;
  }
}));
