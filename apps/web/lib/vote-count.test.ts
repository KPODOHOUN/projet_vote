import assert from "node:assert/strict";
import test from "node:test";
import { displayedVoteCount } from "./vote-count";

test("compteur: aucune voix ajoutée tant que le paiement n'est pas confirmé", () => {
  assert.equal(displayedVoteCount(120, null), 120);
});

test("compteur: après SUCCEEDED, ajoute la quantité exacte payée (pas +1)", () => {
  assert.equal(displayedVoteCount(120, 5), 125);
  assert.equal(displayedVoteCount(0, 1), 1);
});

test("compteur: une quantité invalide n'ajoute rien", () => {
  assert.equal(displayedVoteCount(120, 0), 120);
  assert.equal(displayedVoteCount(120, -3), 120);
  assert.equal(displayedVoteCount(120, 2.5), 120);
});
