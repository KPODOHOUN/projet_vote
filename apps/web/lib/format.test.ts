import { test } from "node:test";
import * as assert from "node:assert/strict";
import { formatCfa, formatEventDate } from "./format";

const clean = (s: string) => s.replace(/[  ]/g, " ");

test("formatCfa : XOF entier, locale de la page", () => {
  assert.equal(clean(formatCfa(1500, "fr")), "1 500 F CFA");
  assert.equal(clean(formatCfa(1500, "en")), "F CFA 1,500");
  assert.equal(clean(formatCfa(99.6, "fr")), "100 F CFA");
});

test("formatEventDate : date lisible dans la locale, vide si invalide", () => {
  assert.equal(formatEventDate("2026-11-10T18:00:00.000Z", "fr"), "10 novembre 2026");
  assert.equal(formatEventDate("2026-11-10T18:00:00.000Z", "en"), "10 November 2026");
  assert.equal(formatEventDate("pas une date", "fr"), "");
});
