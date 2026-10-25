import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_PRESETS } from "./event-presets";
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

test("modèles : les dix styles de page sont proposés au moins une fois", () => {
  const styles = new Set(EVENT_PRESETS.map((p) => p.pageStyle));
  for (const style of ["AFFICHE", "SOIREE", "BILLET", "COURONNE", "MAGAZINE", "POP", "TERROIR", "STADE", "LINEUP", "DIPLOME"]) {
    assert.ok(styles.has(style as never), style);
  }
});
