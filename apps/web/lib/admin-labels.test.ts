import { test } from "node:test";
import * as assert from "node:assert/strict";
import { auditActionLabel, roleLabel, shortRef, targetTypeLabel } from "./admin-labels";

test("roleLabel : rôle lisible, jamais le nom technique", () => {
  assert.equal(roleLabel("PLATFORM_ADMIN", false), "Admin plateforme");
  assert.equal(roleLabel("ORGANIZER_OWNER", false), "Organisateur");
  assert.equal(roleLabel("ORGANIZER_STAFF", true), "Team member");
  assert.equal(roleLabel("INCONNU", false), "Autre rôle");
});

test("auditActionLabel : action connue traduite, inconnue rendue lisible", () => {
  assert.equal(auditActionLabel("auth.login", false), "Connexion");
  assert.equal(auditActionLabel("event.updated", true), "Event updated");
  assert.equal(auditActionLabel("foo.bar_baz", false), "Foo · bar baz");
});

test("targetTypeLabel : type de cible lisible", () => {
  assert.equal(targetTypeLabel("Event", false), "Événement");
  assert.equal(targetTypeLabel("PaymentTransaction", true), "Payment");
  assert.equal(targetTypeLabel("Xyz", false), "Xyz");
});

test("shortRef : référence courte et stable, vide si absente", () => {
  assert.equal(shortRef("cmvp6628z0033444xor7t3171"), "#7T3171");
  assert.equal(shortRef(null), "");
});
