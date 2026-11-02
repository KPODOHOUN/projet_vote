import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePayinPhone, payinNetworksFor, resolvePayinNetwork } from "./mobile-operator";

test("normalizePayinPhone: numéro international avec + préservé (pan-Afrique)", () => {
  assert.equal(normalizePayinPhone("+2250102030405"), "2250102030405"); // Côte d'Ivoire
  assert.equal(normalizePayinPhone("+221 77 000 00 00"), "221770000000"); // Sénégal
  assert.equal(normalizePayinPhone("+234 802 000 0000"), "2348020000000"); // Nigéria
});

test("normalizePayinPhone: préfixe international 00 retiré", () => {
  assert.equal(normalizePayinPhone("0022990000001"), "2290190000001");
});

test("normalizePayinPhone: indicatif pays africain déjà présent → conservé (pas de double 229)", () => {
  assert.equal(normalizePayinPhone("2250102030405"), "2250102030405");
  assert.equal(normalizePayinPhone("22990000001"), "2290190000001");
});

test("normalizePayinPhone: numéro Bénin à 10 chiffres → le 0 fait partie du numéro (+229 01…)", () => {
  assert.equal(normalizePayinPhone("0166000000"), "2290166000000");
  assert.equal(normalizePayinPhone("01 97 00 00 00"), "2290197000000");
  assert.equal(normalizePayinPhone("+229 01 97 00 00 00"), "2290197000000");
});

test("normalizePayinPhone: ancien numéro Bénin à 8 chiffres → « 01 » ajouté", () => {
  assert.equal(normalizePayinPhone("90000001"), "2290190000001");
  assert.equal(normalizePayinPhone("+229 97 00 00 00"), "2290197000000");
});

test("normalizePayinPhone: Côte d'Ivoire garde aussi son 0 de tête", () => {
  assert.equal(normalizePayinPhone("0707000000", "225"), "2250707000000");
});

test("normalizePayinPhone: indicatif par défaut paramétrable (autre pays)", () => {
  assert.equal(normalizePayinPhone("0770000000", "221"), "221770000000");
});

test("normalizePayinPhone: numéro béninois impossible → 400 (10 chiffres commençant par 01)", () => {
  assert.throws(() => normalizePayinPhone("0766000001"), /Numéro béninois invalide/);
  assert.throws(() => normalizePayinPhone("+229 66 00 00"), /Numéro béninois invalide/);
  assert.throws(() => normalizePayinPhone("229019700000012"), /Numéro béninois invalide/);
});

test("resolvePayinNetwork: réseau choisi validé et normalisé", () => {
  assert.equal(resolvePayinNetwork("MTN", "FEDAPAY"), "mtn");
  assert.equal(resolvePayinNetwork(" Moov ", "FEDAPAY"), "moov");
  assert.equal(resolvePayinNetwork("Celtiis", "FEEXPAY"), "celtiis");
});

test("resolvePayinNetwork: réseau absent → 400, jamais deviné d'après le numéro", () => {
  assert.throws(() => resolvePayinNetwork(undefined, "FEDAPAY"), /Choisissez votre réseau Mobile Money \(MTN, MOOV\)/);
  assert.throws(() => resolvePayinNetwork("  ", "FEEXPAY"), /Choisissez votre réseau/);
});

test("resolvePayinNetwork: le message ne propose que les réseaux du prestataire", () => {
  // Orange n'est pas dans la liste blanche ; Celtiis n'est pas débitable par FedaPay.
  assert.throws(() => resolvePayinNetwork("orange", "FEDAPAY"), /Le réseau ORANGE n'est pas accepté pour ce paiement\. Réseaux acceptés : MTN, MOOV\.$/);
  assert.throws(() => resolvePayinNetwork("celtiis", "FEDAPAY"), /Le réseau CELTIIS n'est pas accepté.*: MTN, MOOV\.$/);
  assert.throws(() => resolvePayinNetwork("orange", "FEEXPAY"), /Réseaux acceptés : MTN, MOOV, CELTIIS\.$/);
});

test("resolvePayinNetwork: tentative d'injection de segment → 400 sans recopier la saisie", () => {
  for (const raw of ["../payouts", "mtn/../x"]) {
    assert.throws(() => resolvePayinNetwork(raw, "FEEXPAY"), (error: Error) => /n'est pas accepté/.test(error.message) && !error.message.includes(raw));
  }
});

test("resolvePayinNetwork: prestataire sans réseau → 400 explicite", () => {
  assert.throws(() => resolvePayinNetwork("mtn", "KKIAPAY"), /Aucun réseau Mobile Money n'est disponible/);
});

test("payinNetworksFor: seuls les réseaux que le prestataire sait débiter", () => {
  assert.deepEqual(payinNetworksFor("FEEXPAY"), ["mtn", "moov", "celtiis"]);
  assert.deepEqual(payinNetworksFor("FEDAPAY"), ["mtn", "moov"]);
  assert.deepEqual(payinNetworksFor("KKIAPAY"), []);
});
