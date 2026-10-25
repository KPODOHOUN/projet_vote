import type { CSSProperties } from "react";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type EventBranding = {
  logoUrl: string | null;
  brandColor: string | null;
  tagline: string | null;
};

export function normalizeBrandColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed.match(/^#(.)(.)(.)$/) ?? [];
    if (r && g && b) return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeBrandColor(hex) ?? hex;
  const raw = normalized.replace("#", "");
  const value = parseInt(raw, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Couleur par défaut d'un événement : brand-600, 6,3:1 avec du blanc. */
export const DEFAULT_BRAND_COLOR = "#4f46e5";
const INK = "#0f172a";
const WHITE = "#ffffff";
const MIN_TEXT_CONTRAST = 4.5;

/** Rapport de contraste WCAG 2.x entre deux couleurs. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Le plus lisible de blanc ou d'encre sur `bg`. */
function onBest(bg: string): { color: string; ratio: number } {
  const white = contrastRatio(WHITE, bg);
  const ink = contrastRatio(INK, bg);
  return white >= ink ? { color: WHITE, ratio: white } : { color: INK, ratio: ink };
}

export function readableTextOnBackground(hex: string): string {
  return onBest(hex).color;
}

function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Version de la couleur utilisable pour du texte et des boutons sur fond blanc :
 * on assombrit (teinte et saturation conservées, luminosité −1 point par pas)
 * jusqu'à 4,5:1. Une couleur déjà lisible est rendue telle quelle.
 */
export function deriveAccentStrong(accent: string): string {
  if (contrastRatio(accent, WHITE) >= MIN_TEXT_CONTRAST) return accent;
  const { h, s, l } = hexToHsl(accent);
  for (let lightness = Math.floor(l); lightness >= 8; lightness -= 1) {
    const candidate = hslToHex(h, s, lightness);
    if (contrastRatio(candidate, WHITE) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return hslToHex(h, s, 8);
}

export type EventTheme = {
  /** Couleur choisie par l'organisateur : décor et aplats sans texte. */
  accent: string;
  /** Texte, liens, boutons sur fond blanc (≥ 4,5:1). */
  accentStrong: string;
  headerBg: string;
  headerFg: string;
  cssVars: CSSProperties;
};

/**
 * Thème d'un événement, dérivé au rendu (la couleur est stockée telle quelle).
 * Garanties : `--color-primary` ≥ 4,5:1 sur blanc, texte d'en-tête ≥ 4,5:1.
 * La couleur brute n'est jamais une couleur de texte sur fond clair.
 */
export function buildEventTheme(brandColor: string | null | undefined): EventTheme {
  const accent = normalizeBrandColor(brandColor) ?? DEFAULT_BRAND_COLOR;
  const accentStrong = deriveAccentStrong(accent);
  const onAccent = onBest(accent);
  const headerBg = onAccent.ratio >= MIN_TEXT_CONTRAST ? accent : accentStrong;
  const headerFg = onAccent.ratio >= MIN_TEXT_CONTRAST ? onAccent.color : WHITE;
  return {
    accent,
    accentStrong,
    headerBg,
    headerFg,
    cssVars: {
      "--event-accent": accent,
      "--event-accent-strong": accentStrong,
      "--event-on-strong": WHITE,
      "--event-accent-soft": hexToRgba(accent, 0.12),
      "--event-accent-muted": hexToRgba(accent, 0.25),
      "--event-accent-light": hexToRgba(accent, 0.06),
      "--event-header-bg": headerBg,
      "--event-header-fg": headerFg,
      "--color-primary": accentStrong,
      "--color-primary-foreground": WHITE,
      "--color-ring": accentStrong,
    } as CSSProperties
  };
}

export function brandStyle(value: string | null | undefined): CSSProperties | undefined {
  const theme = buildEventTheme(value);
  if (!normalizeBrandColor(value)) return undefined;
  return theme.cssVars;
}

/* ── Extract dominant color from an image (client-side) ────────────────── */
/**
 * Couleur dominante exploitable d'une image (RGBA à plat). Ignore les pixels
 * transparents, quasi blancs (L > 92 %), quasi noirs (L < 8 %) et peu saturés
 * (S < 15 %) ; parmi les compartiments restants, la fréquence l'emporte, la
 * saturation départage. Renvoie null si rien n'est exploitable. Fonction pure
 * (testée sans canvas dans brand.test.ts).
 */
export function dominantColorFromPixels(data: ArrayLike<number>): string | null {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number; sat: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 128) continue;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    if (l > 0.92 || l < 0.08) continue;
    const d = max - min;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (sat < 0.15) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const entry = buckets.get(key);
    if (entry) {
      entry.r += r;
      entry.g += g;
      entry.b += b;
      entry.count += 1;
      entry.sat += sat;
    } else {
      buckets.set(key, { r, g, b, count: 1, sat });
    }
  }
  let best: { r: number; g: number; b: number; count: number; sat: number } | null = null;
  let bestScore = 0;
  for (const entry of buckets.values()) {
    const score = entry.count * (0.5 + entry.sat / entry.count);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (!best) return null;
  return rgbToHex(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count));
}

export function extractColorFromImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 100, 100);
        // getImageData lève une SecurityError si l'image n'autorise pas le CORS.
        resolve(dominantColorFromPixels(ctx.getImageData(0, 0, 100, 100).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ── Presets: organised by ambiance, 0 pink by default ─────────────────── */
export interface BrandPreset {
  color: string;
  label: string;
  labelEn: string;
  vibe: "luxe" | "nature" | "festif" | "pro" | "culture" | "sport";
}

export const BRAND_COLOR_PRESETS: BrandPreset[] = [
  // Luxe
  { color: "#6366F1", label: "Indigo royal", labelEn: "Royal indigo", vibe: "luxe" },
  { color: "#8B5CF6", label: "Violet électrique", labelEn: "Electric violet", vibe: "luxe" },
  { color: "#0F172A", label: "Bleu nuit profond", labelEn: "Deep night blue", vibe: "luxe" },
  { color: "#1E293B", label: "Ardoise", labelEn: "Slate", vibe: "luxe" },
  // Festif
  { color: "#F59E0B", label: "Or chatoyant", labelEn: "Gold", vibe: "festif" },
  { color: "#EF4444", label: "Rouge passion", labelEn: "Passion red", vibe: "festif" },
  { color: "#F97316", label: "Orange feu", labelEn: "Fire orange", vibe: "festif" },
  { color: "#EC4899", label: "Rose élégant", labelEn: "Rose", vibe: "festif" },
  // Nature
  { color: "#10B981", label: "Émeraude", labelEn: "Emerald", vibe: "nature" },
  { color: "#059669", label: "Forêt profonde", labelEn: "Deep forest", vibe: "nature" },
  { color: "#0D9488", label: "Teal océan", labelEn: "Ocean teal", vibe: "nature" },
  { color: "#14B8A6", label: "Turquoise", labelEn: "Turquoise", vibe: "nature" },
  // Pro / Culture
  { color: "#3B82F6", label: "Bleu confiance", labelEn: "Trust blue", vibe: "pro" },
  { color: "#0EA5E9", label: "Ciel serein", labelEn: "Clear sky", vibe: "pro" },
  { color: "#7C2D12", label: "Terre d'Afrique", labelEn: "African earth", vibe: "culture" },
  { color: "#B45309", label: "Cuir noble", labelEn: "Leather", vibe: "culture" },
  // Sport
  { color: "#E11D48", label: "Rouge écarlate", labelEn: "Scarlet", vibe: "sport" },
  { color: "#0284C7", label: "Bleu dynamique", labelEn: "Bright blue", vibe: "sport" },
];

export function getBrandPresetsByVibe(): Record<string, BrandPreset[]> {
  const acc: Record<string, BrandPreset[]> = {};
  for (const preset of BRAND_COLOR_PRESETS) {
    if (!acc[preset.vibe]) acc[preset.vibe] = [];
    acc[preset.vibe]!.push(preset);
  }
  return acc;
}
