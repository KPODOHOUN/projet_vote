import assert from "node:assert/strict";
import test from "node:test";
import { fitWithin } from "./image-resize";

test("réduction : le plus grand côté passe à la limite, proportions gardées", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(1080, 1920, 1600), { width: 900, height: 1600 });
});

test("réduction : une image déjà petite n'est pas agrandie", () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
});

test("réduction : dimensions invalides → null", () => {
  assert.equal(fitWithin(0, 600, 1600), null);
  assert.equal(fitWithin(Number.NaN, 600, 1600), null);
});
