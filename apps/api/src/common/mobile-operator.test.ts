import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectMobileOperator,
  isSupportedOperator,
  normalizePayinPhone,
  resolvePayinOperator
} from "./mobile-operator";

test("normalizePayinPhone: numéro international avec + préservé (pan-Afrique)", () => {
  assert.equal(normalizePayinPhone("+2250102030405"), "2250102030405"); // Côte d'Ivoire
  assert.equal(normalizePayinPhone("+221 77 000 00 00"), "221770000000"); // Sénégal
  assert.equal(normalizePayinPhone("+234 802 000 0000"), "2348020000000"); // Nigéria
});

test("normalizePayinPhone: préfixe international 00 retiré", () => {
  assert.equal(normalizePayinPhone("0022990000001"), "22990000001");
});

test("normalizePayinPhone: indicatif pays africain déjà présent → conservé (pas de double 229)", () => {
  assert.equal(normalizePayinPhone("2250102030405"), "2250102030405");
  assert.equal(normalizePayinPhone("22990000001"), "22990000001");
});

test("normalizePayinPhone: numéro local Bénin (trunk 0) → indicatif par défaut", () => {
  assert.equal(normalizePayinPhone("0166000000"), "229166000000");
});

test("normalizePayinPhone: numéro local nu → indicatif par défaut", () => {
  assert.equal(normalizePayinPhone("90000001"), "22990000001");
});

test("normalizePayinPhone: indicatif par défaut paramétrable (autre pays)", () => {
  assert.equal(normalizePayinPhone("0770000000", "221"), "221770000000");
});

test("detectMobileOperator: heuristique Bénin (fallback)", () => {
  // Après retrait de l'indicatif 229, un local commençant par 019/010 → Moov.
  assert.equal(detectMobileOperator("229019000000"), "moov");
  assert.equal(detectMobileOperator("229010000000"), "moov");
  assert.equal(detectMobileOperator("22990000000"), "mtn");
  // Hors Bénin sans opérateur explicite → défaut mtn (sûr).
  assert.equal(detectMobileOperator("2250102030405"), "mtn");
});

test("resolvePayinOperator: opérateur explicite validé et normalisé", () => {
  assert.equal(resolvePayinOperator("MTN", "2250102030405"), "mtn");
  assert.equal(resolvePayinOperator("orange", "2250102030405"), "orange");
  assert.equal(resolvePayinOperator("Moov", "22990000000"), "moov");
});

test("resolvePayinOperator: fallback détection quand opérateur absent", () => {
  assert.equal(resolvePayinOperator(undefined, "229019000000"), "moov");
  assert.equal(resolvePayinOperator(undefined, "22990000000"), "mtn");
});

test("resolvePayinOperator: opérateur hors liste blanche → 400", () => {
  assert.throws(() => resolvePayinOperator("vodafone", "2250102030405"), /non supporté/);
});

test("resolvePayinOperator: tentative d'injection de segment → 400", () => {
  assert.throws(() => resolvePayinOperator("../payouts", "2250102030405"), /non supporté/);
  assert.throws(() => resolvePayinOperator("mtn/../x", "2250102030405"), /non supporté/);
});

test("isSupportedOperator: liste blanche par défaut", () => {
  assert.equal(isSupportedOperator("mtn"), true);
  assert.equal(isSupportedOperator("MOOV"), true);
  assert.equal(isSupportedOperator("orange"), true);
  assert.equal(isSupportedOperator("wave"), false);
});
