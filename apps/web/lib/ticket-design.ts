/**
 * Billet dessiné par l'organisateur (éditeur /dashboard/.../tickets/designer).
 * Un seul modèle sert à l'éditeur et au rendu du billet livré (page, image
 * téléchargeable, e-mail) : ce que l'organisateur voit est ce que l'acheteur reçoit.
 * Coordonnées et tailles en unités du billet (design.width × design.height).
 */
export type LayerType = "text" | "image" | "qr" | "shape";
export type ShapeKind = "rect" | "ellipse" | "line";

export type LayerStyle = {
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: TicketFontId;
  color?: string;
  textAlign?: "left" | "center" | "right";
  fontStyle?: string;
  textDecoration?: string;
  letterSpacing?: number;
  lineHeight?: number;
  objectFit?: "contain" | "cover" | "fill";
  opacity?: number;
  borderRadius?: number;
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export type DesignLayer = {
  id: string;
  /** « qr » : emplacement du QR code d'entrée ; « shape » : rectangle, ellipse ou ligne. */
  type: LayerType;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  /** Verrouillé : ni déplacé ni redimensionné sur le canevas. */
  locked?: boolean;
  rotation?: number;
  style: LayerStyle;
};

export type TicketDesign = {
  width: number;
  height: number;
  background: { type: "color" | "gradient"; value: string };
  backgroundImage: string | null;
  layers: DesignLayer[];
};

/** Polices proposées : chacune existe dans l'éditeur (variable CSS) et au rendu (TTF). */
export const TICKET_FONTS = [
  { id: "inter", label: "Inter", cssVar: "--font-body", file: "Inter" },
  { id: "jakarta", label: "Plus Jakarta Sans", cssVar: "--font-display", file: "PlusJakartaSans" },
  { id: "playfair", label: "Playfair Display", cssVar: "--font-gala", file: "PlayfairDisplay" },
  { id: "unbounded", label: "Unbounded", cssVar: "--font-festival", file: "Unbounded" },
  { id: "mono", label: "JetBrains Mono", cssVar: "--font-mono", file: "JetBrainsMono" }
] as const;
export type TicketFontId = (typeof TICKET_FONTS)[number]["id"];

export function ticketFont(id: string | undefined) {
  return TICKET_FONTS.find((font) => font.id === id) ?? TICKET_FONTS[0];
}

/** Formats de billet proposés (unités du billet). */
export const TICKET_FORMATS = [
  { id: "billet", fr: "Billet paysage", en: "Landscape ticket", width: 1200, height: 500 },
  { id: "carte", fr: "Carte (A6)", en: "Card (A6)", width: 1050, height: 740 },
  { id: "vertical", fr: "Vertical (téléphone)", en: "Vertical (phone)", width: 720, height: 1280 },
  { id: "carre", fr: "Carré", en: "Square", width: 1000, height: 1000 }
] as const;

export const BACKGROUND_PRESETS: ReadonlyArray<TicketDesign["background"]> = [
  { type: "color", value: "#0a0c10" },
  { type: "color", value: "#ffffff" },
  { type: "color", value: "#1e3a5f" },
  { type: "color", value: "#7c2d12" },
  { type: "gradient", value: "linear-gradient(135deg, #111827 0%, #312e81 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #7c2d12 0%, #f59e0b 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #064e3b 0%, #10b981 100%)" },
  { type: "gradient", value: "linear-gradient(135deg, #4c0519 0%, #e11d48 100%)" },
  { type: "gradient", value: "linear-gradient(180deg, #0f172a 0%, #0f172a 60%, #ca8a04 100%)" }
];

/** Champs remplacés par les informations de chaque billet au moment du rendu. */
export const TICKET_FIELDS = [
  { token: "{{titulaire}}", fr: "Nom du titulaire", en: "Holder name" },
  { token: "{{billet}}", fr: "Type de billet", en: "Ticket type" },
  { token: "{{evenement}}", fr: "Nom de l'événement", en: "Event name" },
  { token: "{{date}}", fr: "Date de l'événement", en: "Event date" },
  { token: "{{prix}}", fr: "Prix", en: "Price" },
  { token: "{{numero}}", fr: "Numéro du billet", en: "Ticket number" }
] as const;

export type TicketValues = {
  ticketId: string;
  /** Numéro lisible attribué au paiement (N° 0042) ; absent avant paiement. */
  number?: number | null | undefined;
  holderName: string | null;
  ticketTypeName: string;
  eventTitle: string;
  eventStartsAt: string | null;
  amountCfa: number;
};

/** Numéro lisible d'un billet (affiché, jamais utilisé pour entrer) : « 0042 », sinon fin de l'identifiant. */
export function ticketNumber(ticketId: string, number?: number | null): string {
  return number ? String(number).padStart(4, "0") : ticketId.slice(-8).toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Porto-Novo" });
}

function formatCfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

export function fillTicketText(content: string, values: TicketValues): string {
  const map: Record<string, string> = {
    "{{titulaire}}": values.holderName?.trim() || "Invité",
    "{{billet}}": values.ticketTypeName,
    "{{evenement}}": values.eventTitle,
    "{{date}}": formatDate(values.eventStartsAt),
    "{{prix}}": formatCfa(values.amountCfa),
    "{{numero}}": ticketNumber(values.ticketId, values.number)
  };
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => map[`{{${key.toLowerCase()}}}`] ?? match);
}

/** Aucun calque ni image : l'organisateur n'a rien dessiné. */
export function isBlankDesign(design: TicketDesign | null | undefined): boolean {
  return !design || (design.layers.length === 0 && !design.backgroundImage);
}

let layerSeq = 0;
/** Identifiant de calque (unique dans un design). */
export function newLayerId(prefix: string = "layer"): string {
  layerSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${layerSeq}`;
}

function textLayer(id: string, content: string, x: number, y: number, width: number, fontSize: number, style: Partial<LayerStyle> = {}): DesignLayer {
  return {
    id, type: "text", content, x, y, width, height: Math.round(fontSize * 1.4), zIndex: 2, visible: true,
    style: { fontSize, fontWeight: "400", color: "#ffffff", textAlign: "left", fontFamily: "inter", ...style }
  };
}

function qrLayer(x: number, y: number, size: number): DesignLayer {
  return { id: "qr", type: "qr", content: "", x, y, width: size, height: size, zIndex: 3, visible: true, style: {} };
}

/** Billet par défaut, propre et lisible, quand l'organisateur n'a rien dessiné. */
export function defaultTicketDesign(): TicketDesign {
  return {
    width: 1200,
    height: 500,
    background: { type: "gradient", value: "linear-gradient(135deg, #111827 0%, #312e81 100%)" },
    backgroundImage: null,
    layers: [
      textLayer("evenement", "{{evenement}}", 56, 56, 700, 52, { fontWeight: "700" }),
      textLayer("date", "{{date}}", 56, 140, 700, 26, { color: "#c7d2fe" }),
      textLayer("billet", "{{billet}}", 56, 230, 700, 34, { fontWeight: "700" }),
      textLayer("titulaire", "{{titulaire}}", 56, 290, 700, 30, { color: "#e5e7eb" }),
      textLayer("prix", "{{prix}}", 56, 360, 700, 26, { color: "#c7d2fe" }),
      textLayer("numero", "N° {{numero}}", 56, 420, 700, 22, { color: "#9ca3af" }),
      qrLayer(820, 70, 330)
    ]
  };
}

/** Modèles de départ de l'éditeur (remplacent le design en cours). */
export const TICKET_TEMPLATES: ReadonlyArray<{ id: string; fr: string; en: string; build: () => TicketDesign }> = [
  { id: "classique", fr: "Classique", en: "Classic", build: defaultTicketDesign },
  {
    id: "gala",
    fr: "Gala",
    en: "Gala",
    build: () => ({
      width: 1200,
      height: 500,
      background: { type: "gradient", value: "linear-gradient(180deg, #0f172a 0%, #0f172a 60%, #ca8a04 100%)" },
      backgroundImage: null,
      layers: [
        { id: "cadre", type: "shape", content: "", x: 24, y: 24, width: 1152, height: 452, zIndex: 1, visible: true,
          style: { shape: "rect", fill: "transparent", stroke: "#ca8a04", strokeWidth: 3, borderRadius: 18 } },
        textLayer("evenement", "{{evenement}}", 70, 70, 720, 58, { fontFamily: "playfair", fontWeight: "700", color: "#fde68a" }),
        textLayer("date", "{{date}}", 70, 160, 720, 26, { color: "#e2e8f0" }),
        { id: "filet", type: "shape", content: "", x: 70, y: 215, width: 260, height: 3, zIndex: 2, visible: true,
          style: { shape: "line", stroke: "#ca8a04", strokeWidth: 3 } },
        textLayer("billet", "{{billet}}", 70, 250, 720, 36, { fontFamily: "playfair", fontWeight: "700" }),
        textLayer("titulaire", "{{titulaire}}", 70, 310, 720, 30, { color: "#e2e8f0" }),
        textLayer("numero", "{{prix}} · N° {{numero}}", 70, 400, 720, 22, { color: "#fde68a" }),
        qrLayer(840, 85, 300)
      ]
    })
  },
  {
    id: "festival",
    fr: "Festival",
    en: "Festival",
    build: () => ({
      width: 720,
      height: 1280,
      background: { type: "gradient", value: "linear-gradient(135deg, #4c0519 0%, #e11d48 100%)" },
      backgroundImage: null,
      layers: ([
        { id: "bulle", type: "shape", content: "", x: 380, y: -120, width: 520, height: 520, zIndex: 1, visible: true,
          style: { shape: "ellipse", fill: "#fda4af", opacity: 0.35 } },
        { ...textLayer("evenement", "{{evenement}}", 56, 120, 608, 64, { fontFamily: "unbounded", fontWeight: "700" }), height: 180 },
        textLayer("date", "{{date}}", 56, 330, 608, 28, { color: "#ffe4e6" }),
        textLayer("billet", "{{billet}}", 56, 410, 608, 40, { fontFamily: "unbounded", fontWeight: "700" }),
        textLayer("titulaire", "{{titulaire}}", 56, 480, 608, 32, { color: "#ffe4e6" }),
        { id: "carte-qr", type: "shape", content: "", x: 140, y: 640, width: 440, height: 440, zIndex: 2, visible: true,
          style: { shape: "rect", fill: "#ffffff", borderRadius: 32 } },
        qrLayer(170, 670, 380),
        textLayer("numero", "N° {{numero}} · {{prix}}", 56, 1140, 608, 26, { color: "#ffe4e6", textAlign: "center" })
      ] satisfies DesignLayer[]).map((layer, index) => ({ ...layer, zIndex: index + 1 }))
    })
  }
];

/**
 * Calques à rendre : le design de l'organisateur (ou le billet par défaut), avec
 * toujours un QR code — sans lui le billet ne permet pas d'entrer.
 */
export function layersToRender(design: TicketDesign): DesignLayer[] {
  const visible = design.layers.filter((layer) => layer.visible).sort((a, b) => a.zIndex - b.zIndex);
  if (visible.some((layer) => layer.type === "qr")) return visible;
  const size = Math.round(Math.min(design.height * 0.7, design.width * 0.3));
  const margin = Math.round(Math.min(design.width, design.height) * 0.06);
  return [
    ...visible,
    {
      id: "qr-auto", type: "qr", content: "", x: design.width - size - margin, y: design.height - size - margin,
      width: size, height: size, zIndex: 10_000, visible: true, style: {}
    }
  ];
}

/**
 * Image d'un design autorisée au rendu serveur : imports de la plateforme et
 * Cloudinary uniquement (le serveur ne va jamais chercher une adresse quelconque).
 */
export function renderableImageUrl(url: string | null | undefined, apiOrigin: string): string | null {
  if (!url) return null;
  if (url.startsWith("/api/v1/uploads/files/") && !url.includes("..")) return `${apiOrigin}${url}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Le rendu du billet ne sait pas lire le WebP (format des imports de l'ancien
 * éditeur) : ces images sont ignorées au rendu, l'éditeur demande de les remplacer.
 */
export function isUnrenderableImage(url: string | null | undefined): boolean {
  return typeof url === "string" && /\.webp(\?|#|$)/i.test(url);
}
