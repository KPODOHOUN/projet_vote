import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
  buildEventTheme,
  contrastRatio,
  deriveAccentStrong,
  normalizeBrandColor,
} from "./brand";

const WHITE = "#ffffff";

function randomHex(seed: number): string {
  // Générateur déterministe (LCG) : la même série à chaque exécution.
  let x = seed;
  const next = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % 256;
  };
  return `#${[next(), next(), next()].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

const MANUAL_COLORS = ["#ffffff", "#fff9c4", "#e5e7eb", "#000000", "#39ff14", "#ff0", "#6366F1"];
const SAMPLE = [
  ...BRAND_COLOR_PRESETS.map((p) => p.color),
  ...MANUAL_COLORS,
  ...Array.from({ length: 500 }, (_, i) => randomHex(i + 1)),
];

test("thème: --color-primary atteint 4,5:1 sur blanc pour presets, couleurs libres et 500 aléatoires", () => {
  for (const color of SAMPLE) {
    const theme = buildEventTheme(color);
    const primary = (theme.cssVars as Record<string, string>)["--color-primary"]!;
    assert.ok(contrastRatio(primary, WHITE) >= 4.5, `${color} → ${primary} : ${contrastRatio(primary, WHITE).toFixed(2)}`);
    assert.equal(primary, theme.accentStrong);
  }
});

test("thème: le texte de l'en-tête atteint 4,5:1 sur son fond, pour tout l'échantillon", () => {
  for (const color of SAMPLE) {
    const theme = buildEventTheme(color);
    const ratio = contrastRatio(theme.headerFg, theme.headerBg);
    assert.ok(ratio >= 4.5, `${color} : en-tête ${theme.headerFg} sur ${theme.headerBg} = ${ratio.toFixed(2)}`);
  }
});

test("thème: l'en-tête garde la couleur brute quand elle reste lisible", () => {
  const navy = buildEventTheme("#1e3a8a");
  assert.equal(navy.headerBg, "#1e3a8a");
  assert.equal(navy.headerFg, WHITE);
  const gold = buildEventTheme("#f59e0b");
  assert.equal(gold.headerBg, "#f59e0b");
  assert.equal(gold.headerFg, "#0f172a");
});

test("thème: une couleur déjà assez sombre n'est pas modifiée", () => {
  assert.equal(deriveAccentStrong("#4f46e5"), "#4f46e5");
  assert.equal(deriveAccentStrong("#1e3a8a"), "#1e3a8a");
});

test("thème: cas de référence d'assombrissement (±1 par canal)", () => {
  const close = (actual: string, expected: string) => {
    const a = actual.match(/[0-9a-f]{2}/g)!.map((h) => parseInt(h, 16));
    const e = expected.match(/[0-9a-f]{2}/g)!.map((h) => parseInt(h, 16));
    a.forEach((v, i) => assert.ok(Math.abs(v - e[i]!) <= 1, `${actual} ≠ ${expected}`));
  };
  close(deriveAccentStrong("#f59e0b"), "#a36907");
  close(deriveAccentStrong("#14b8a6"), "#0e8578");
  close(deriveAccentStrong("#ffffff"), "#757575");
});

test("thème: plus de dégradé ni de lueur dans les variables émises", () => {
  const vars = buildEventTheme("#14b8a6").cssVars as Record<string, string>;
  for (const key of Object.keys(vars)) {
    assert.ok(!/gradient|glow|accent-alt/.test(key), `variable interdite : ${key}`);
  }
  assert.equal(vars["--color-primary-foreground"], WHITE);
  assert.equal(vars["--event-accent"], "#14b8a6");
});

test("normalizeBrandColor: idempotente, #RGB étendu, entrée invalide → null", () => {
  for (const color of SAMPLE) {
    const once = normalizeBrandColor(color);
    assert.equal(normalizeBrandColor(once), once);
  }
  assert.equal(normalizeBrandColor("#ff0"), "#ffff00");
  assert.equal(normalizeBrandColor("rouge"), null);
  assert.equal(normalizeBrandColor(""), null);
});

test("thème: entrée invalide ou vide → couleur par défaut #4F46E5", () => {
  assert.equal(DEFAULT_BRAND_COLOR.toLowerCase(), "#4f46e5");
  for (const input of [null, undefined, "", "pas-une-couleur", "#12"]) {
    assert.equal(buildEventTheme(input).accent, "#4f46e5");
  }
});
