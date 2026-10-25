import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_PRESETS, EVENT_PRESET_CATEGORIES, filterPresets } from "./event-presets";
import { normalizeBrandColor } from "./brand";
import { pageStyleOf, fontStyleOf } from "./minisite-style";

test("modèles : identifiants uniques, couleurs valides, styles et polices connus", () => {
  const ids = new Set(EVENT_PRESETS.map((p) => p.id));
  assert.equal(ids.size, EVENT_PRESETS.length);
  for (const preset of EVENT_PRESETS) {
    assert.ok(normalizeBrandColor(preset.brandColor), preset.id);
    assert.equal(pageStyleOf(preset.pageStyle), preset.pageStyle.toLowerCase(), preset.id);
    assert.equal(fontStyleOf(preset.fontStyle), preset.fontStyle.toLowerCase(), preset.id);
    assert.ok(preset.fr && preset.en, preset.id);
  }
});

test("modèles : les dix-sept styles de page sont proposés au moins une fois", () => {
  const styles = new Set(EVENT_PRESETS.map((p) => p.pageStyle));
  for (const style of ["AFFICHE", "SOIREE", "BILLET", "COURONNE", "MAGAZINE", "POP", "TERROIR", "STADE", "LINEUP", "DIPLOME", "MARCHE", "MENU", "WAX", "CAMPUS", "BADGE", "STORY", "SANCTUAIRE"]) {
    assert.ok(styles.has(style as never), style);
  }
});

test("modèles : deux modèles ne partagent jamais style + police + couleur", () => {
  const combos = new Set(EVENT_PRESETS.map((p) => `${p.pageStyle}/${p.fontStyle}/${p.brandColor.toLowerCase()}`));
  assert.equal(combos.size, EVENT_PRESETS.length);
});

test("familles : chaque modèle a une famille connue, chaque famille a des modèles", () => {
  const ids = new Set(EVENT_PRESET_CATEGORIES.map((c) => c.id));
  assert.equal(ids.size, EVENT_PRESET_CATEGORIES.length);
  for (const preset of EVENT_PRESETS) assert.ok(ids.has(preset.category), preset.id);
  for (const category of EVENT_PRESET_CATEGORIES) {
    assert.ok(filterPresets(category.id, "").length >= 5, category.id);
  }
});

test("filterPresets : sans recherche, la famille ; avec, tous les modèles, accents ignorés", () => {
  assert.ok(filterPresets("terroir", "").every((p) => p.category === "terroir"));
  assert.ok(filterPresets("beaute", "elevage").some((p) => p.id === "elevage"));
  assert.ok(filterPresets("beaute", "  CACAO ").some((p) => p.id === "cafe-cacao"));
  assert.ok(filterPresets("beaute", "livestock").some((p) => p.id === "elevage"));
  assert.ok(filterPresets("beaute", "agriculture").length >= 10);
  assert.deepEqual(filterPresets("beaute", "zzzz"), []);
});
