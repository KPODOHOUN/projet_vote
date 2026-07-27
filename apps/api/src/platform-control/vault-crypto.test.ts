import { test } from "node:test";
import * as assert from "node:assert/strict";
import { encryptVaultPayload, decryptVaultPayload } from "./vault-crypto";

const KEY = "x".repeat(48); // suffisamment long pour scrypt

test("encrypt puis decrypt restitue le payload original", () => {
  const payload = { hello: "monde", amountCfa: 500 };
  const enc = encryptVaultPayload(JSON.stringify(payload), KEY);
  assert.ok(enc.cipherText.length > 0);
  assert.equal(enc.iv.length, 24); // 12 bytes hex = 24 chars
  assert.equal(enc.authTag.length, 32); // 16 bytes hex = 32 chars
  const dec = decryptVaultPayload(enc, KEY);
  assert.deepEqual(JSON.parse(dec), payload);
});

test("decrypt avec mauvaise clé : throw", () => {
  const enc = encryptVaultPayload("secret", KEY);
  assert.throws(() => decryptVaultPayload(enc, "y".repeat(48)));
});

test("decrypt avec authTag altéré : throw (intégrité GCM)", () => {
  const enc = encryptVaultPayload("secret", KEY);
  const tampered = { ...enc, authTag: "0".repeat(32) };
  assert.throws(() => decryptVaultPayload(tampered, KEY));
});
