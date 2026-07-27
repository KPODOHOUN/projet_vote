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

export function readableTextOnBackground(hex: string): string {
  return relativeLuminance(hex) > 0.55 ? "#0f172a" : "#ffffff";
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
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
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

function shiftColor(hex: string, lightnessShift: number, saturationShift = 0): string {
  const hsl = hexToHsl(hex);
  const newL = Math.max(0, Math.min(100, hsl.l + lightnessShift));
  const newS = Math.max(0, Math.min(100, hsl.s + saturationShift));
  return hslToHex(hsl.h, newS, newL);
}

export type EventTheme = {
  accent: string;
  accentAlt: string;
  headerBg: string;
  headerFg: string;
  cssVars: CSSProperties;
};

export function buildEventTheme(brandColor: string | null | undefined): EventTheme {
  const accent = normalizeBrandColor(brandColor) ?? "#6366F1";
  const accentAlt = shiftColor(accent, 15, 10);
  const headerFg = readableTextOnBackground(accent);
  return {
    accent,
    accentAlt,
    headerBg: accent,
    headerFg,
    cssVars: {
      "--event-accent": accent,
      "--event-accent-alt": accentAlt,
      "--event-accent-soft": hexToRgba(accent, 0.12),
      "--event-accent-muted": hexToRgba(accent, 0.25),
      "--event-accent-light": hexToRgba(accent, 0.06),
      "--event-header-bg": accent,
      "--event-header-fg": headerFg,
      "--color-primary": accent,
      "--color-ring": accent,
      "--event-gradient-start": accent,
      "--event-gradient-end": accentAlt,
      "--event-glow": hexToRgba(accent, 0.3),
    } as CSSProperties
  };
}

export function brandStyle(value: string | null | undefined): CSSProperties | undefined {
  const theme = buildEventTheme(value);
  if (!normalizeBrandColor(value)) return undefined;
  return theme.cssVars;
}

/* ── Extract dominant color from an image (client-side) ────────────────── */
export function extractColorFromImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, 100, 100);
      const data: number[] = Array.from(ctx.getImageData(0, 0, 100, 100).data);
      const colorCounts: Record<string, { r: number; g: number; b: number; count: number }> = {};
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
        if (a < 128) continue;
        const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`;
        if (colorCounts[key]) {
          colorCounts[key]!.count++;
        } else {
          colorCounts[key] = { r, g, b, count: 1 };
        }
      }
      let maxCount = 0;
      let dominant = { r: 99, g: 102, b: 241 };
      for (const key in colorCounts) {
        const entry = colorCounts[key]!;
        if (entry.count > maxCount) {
          maxCount = entry.count;
          dominant = entry;
        }
      }
      resolve(rgbToHex(dominant.r, dominant.g, dominant.b));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ── Presets: organised by ambiance, 0 pink by default ─────────────────── */
export interface BrandPreset {
  color: string;
  label: string;
  vibe: "luxe" | "nature" | "festif" | "pro" | "culture" | "sport";
}

export const BRAND_COLOR_PRESETS: BrandPreset[] = [
  // Luxe
  { color: "#6366F1", label: "Indigo royal", vibe: "luxe" },
  { color: "#8B5CF6", label: "Violet électrique", vibe: "luxe" },
  { color: "#0F172A", label: "Bleu nuit profond", vibe: "luxe" },
  { color: "#1E293B", label: "Ardoise premium", vibe: "luxe" },
  // Festif
  { color: "#F59E0B", label: "Or chatoyant", vibe: "festif" },
  { color: "#EF4444", label: "Rouge passion", vibe: "festif" },
  { color: "#F97316", label: "Orange feu", vibe: "festif" },
  { color: "#EC4899", label: "Rose élégant", vibe: "festif" },
  // Nature
  { color: "#10B981", label: "Émeraude", vibe: "nature" },
  { color: "#059669", label: "Forêt profonde", vibe: "nature" },
  { color: "#0D9488", label: "Teal océan", vibe: "nature" },
  { color: "#14B8A6", label: "Turquoise", vibe: "nature" },
  // Pro / Culture
  { color: "#3B82F6", label: "Bleu confiance", vibe: "pro" },
  { color: "#0EA5E9", label: "Ciel serein", vibe: "pro" },
  { color: "#7C2D12", label: "Terre d'Afrique", vibe: "culture" },
  { color: "#B45309", label: "Cuir noble", vibe: "culture" },
];

export function getBrandPresetsByVibe(): Record<string, BrandPreset[]> {
  const acc: Record<string, BrandPreset[]> = {};
  for (const preset of BRAND_COLOR_PRESETS) {
    if (!acc[preset.vibe]) acc[preset.vibe] = [];
    acc[preset.vibe]!.push(preset);
  }
  return acc;
}
