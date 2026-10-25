import assert from "node:assert/strict";
import test from "node:test";
import { countdownParts, pageStyleOf, fontStyleOf, heroImageOf } from "./minisite-style";

test("style de page : valeurs API → clé CSS, défaut affiche", () => {
  assert.equal(pageStyleOf("AFFICHE"), "affiche");
  assert.equal(pageStyleOf("SOIREE"), "soiree");
  assert.equal(pageStyleOf("BILLET"), "billet");
  assert.equal(pageStyleOf("COURONNE"), "couronne");
  assert.equal(pageStyleOf("MAGAZINE"), "magazine");
  assert.equal(pageStyleOf("POP"), "pop");
  assert.equal(pageStyleOf("TERROIR"), "terroir");
  assert.equal(pageStyleOf("STADE"), "stade");
  assert.equal(pageStyleOf("LINEUP"), "lineup");
  assert.equal(pageStyleOf("DIPLOME"), "diplome");
  assert.equal(pageStyleOf(undefined), "affiche");
  assert.equal(pageStyleOf("NEON"), "affiche");
});

test("police : valeurs API → clé CSS, défaut festival", () => {
  assert.equal(fontStyleOf("FESTIVAL"), "festival");
  assert.equal(fontStyleOf("GALA"), "gala");
  assert.equal(fontStyleOf("CLASSIQUE"), "classique");
  assert.equal(fontStyleOf(null), "festival");
});

test("compte à rebours : jours, heures, minutes restants, arrondis vers le bas", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  const target = "2026-11-01T00:30:59Z"; // 6 j 14 h 30 min 59 s
  assert.deepEqual(countdownParts(target, now), { days: 6, hours: 14, minutes: 30 });
});

test("compte à rebours : échéance passée ou date invalide → null", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  assert.equal(countdownParts("2026-10-25T10:00:00Z", now), null);
  assert.equal(countdownParts("2026-10-24T10:00:00Z", now), null);
  assert.equal(countdownParts("pas une date", now), null);
});

test("compte à rebours : moins d'une minute → 0 j 0 h 0 min (pas encore échu)", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  assert.deepEqual(countdownParts("2026-10-25T10:00:30Z", now), { days: 0, hours: 0, minutes: 0 });
});

test("fond du bandeau : couverture sauf si « couleur unie » ou absente", () => {
  assert.equal(heroImageOf({ coverUrl: "/c.jpg", heroBackground: "IMAGE" }), "/c.jpg");
  assert.equal(heroImageOf({ coverUrl: "/c.jpg" }), "/c.jpg");
  assert.equal(heroImageOf({ coverUrl: "/c.jpg", heroBackground: "COLOR" }), null);
  assert.equal(heroImageOf({ coverUrl: null, heroBackground: "IMAGE" }), null);
});
