import assert from "node:assert/strict";
import test from "node:test";

test("le JWT d'accès reste en mémoire et n'est jamais écrit dans localStorage", async () => {
  const writes: Array<{ key: string; value: string }> = [];
  const removals: string[] = [];
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    value: undefined
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        setItem: (key: string, value: string) => writes.push({ key, value }),
        removeItem: (key: string) => removals.push(key)
      },
      location: { href: "" }
    }
  });

  const { getStoredToken, setStoredToken } = await import("./auth");
  setStoredToken("header.payload.signature");

  assert.equal(getStoredToken(), "header.payload.signature");
  assert.deepEqual(writes, []);
  assert.ok(removals.includes("vp.organizer.token"));
  assert.ok(removals.includes("vp.organizer.refresh-token"));
});
