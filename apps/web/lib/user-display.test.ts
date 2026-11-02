import { test } from "node:test";
import * as assert from "node:assert/strict";
import { displayName, initials } from "./user-display";

test("displayName : prénom + nom quand ils existent", () => {
  assert.equal(displayName({ firstName: "Awa", lastName: "Kouassi", email: "awa@x.bj" }), "Awa Kouassi");
  assert.equal(displayName({ firstName: " Awa ", lastName: null, email: "awa@x.bj" }), "Awa");
});

test("displayName : sinon la partie avant @, avec majuscule", () => {
  assert.equal(displayName({ email: "organisateur@demovote.africa" }), "Organisateur");
  assert.equal(displayName({ firstName: "", lastName: "  ", email: "admin@shadoma.africa" }), "Admin");
});

test("initials : deux lettres au plus, jamais vide", () => {
  assert.equal(initials("Awa Kouassi"), "AK");
  assert.equal(initials("Jean Paul Mensah"), "JM");
  assert.equal(initials("Organisateur"), "O");
  assert.equal(initials("marie.dupont"), "MD");
  assert.equal(initials(""), "?");
});
