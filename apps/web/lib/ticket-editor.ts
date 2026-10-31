/**
 * Moteur de l'éditeur de billets, sans interface : historique (annuler /
 * rétablir), calques, géométrie (poignées, rotation, repères magnétiques,
 * alignement, format). Testé seul ; les composants ne font que l'appeler.
 */
import { newLayerId, type DesignLayer, type LayerStyle, type TicketDesign } from "./ticket-design";

const HISTORY_LIMIT = 100;

export type EditorState = {
  design: TicketDesign;
  selectedId: string | null;
  past: TicketDesign[];
  future: TicketDesign[];
  /** Clé de la dernière modification regroupée (frappe dans un champ) : une seule étape d'historique. */
  lastCoalesce: string | null;
  /** Modifié depuis le dernier enregistrement. */
  dirty: boolean;
};

type ChangeOptions = {
  /** Même clé que la modification précédente : fusionnée dans la même étape d'historique. */
  coalesce?: string | undefined;
  /** Pendant un geste (glisser, redimensionner) : pas d'étape, le point de départ a été posé par `checkpoint`. */
  transient?: boolean | undefined;
};

export type EditorAction =
  | { type: "load"; design: TicketDesign }
  | { type: "select"; id: string | null }
  | { type: "checkpoint" }
  | ({ type: "updateLayer"; id: string; patch: Partial<Omit<DesignLayer, "id" | "style">> } & ChangeOptions)
  | ({ type: "updateStyle"; id: string; patch: Partial<LayerStyle> } & ChangeOptions)
  | ({ type: "setDesign"; patch: Partial<Omit<TicketDesign, "layers">> } & ChangeOptions)
  | { type: "replaceDesign"; design: TicketDesign }
  | { type: "addLayer"; layer: DesignLayer }
  | { type: "removeLayer"; id: string }
  | { type: "duplicateLayer"; id: string }
  | { type: "arrange"; id: string; to: "front" | "back" | "forward" | "backward" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "markSaved" };

export function initialEditorState(design: TicketDesign): EditorState {
  return { design, selectedId: null, past: [], future: [], lastCoalesce: null, dirty: false };
}

function commit(state: EditorState, design: TicketDesign, options: ChangeOptions = {}): EditorState {
  if (design === state.design) return state;
  if (options.transient || (options.coalesce && options.coalesce === state.lastCoalesce)) {
    return { ...state, design, future: [], dirty: true, lastCoalesce: options.transient ? state.lastCoalesce : options.coalesce ?? null };
  }
  return {
    ...state,
    design,
    past: [...state.past, state.design].slice(-HISTORY_LIMIT),
    future: [],
    lastCoalesce: options.coalesce ?? null,
    dirty: true
  };
}

function mapLayer(design: TicketDesign, id: string, change: (layer: DesignLayer) => DesignLayer): TicketDesign {
  return { ...design, layers: design.layers.map((layer) => (layer.id === id ? change(layer) : layer)) };
}

/** zIndex consécutifs dans l'ordre d'empilement. */
function restack(layers: DesignLayer[]): DesignLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex).map((layer, index) => ({ ...layer, zIndex: index + 1 }));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "load":
      return initialEditorState(action.design);
    case "select":
      return { ...state, selectedId: action.id, lastCoalesce: null };
    case "checkpoint":
      return { ...state, past: [...state.past, state.design].slice(-HISTORY_LIMIT), future: [], lastCoalesce: null };
    case "updateLayer":
      return commit(state, mapLayer(state.design, action.id, (layer) => ({ ...layer, ...action.patch })), action);
    case "updateStyle":
      return commit(state, mapLayer(state.design, action.id, (layer) => ({ ...layer, style: { ...layer.style, ...action.patch } })), action);
    case "setDesign":
      return commit(state, { ...state.design, ...action.patch }, action);
    case "replaceDesign":
      return { ...commit(state, action.design), selectedId: null };
    case "addLayer": {
      const top = state.design.layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0);
      const layer = { ...action.layer, zIndex: top + 1 };
      return { ...commit(state, { ...state.design, layers: [...state.design.layers, layer] }), selectedId: layer.id };
    }
    case "removeLayer": {
      const next = commit(state, { ...state.design, layers: restack(state.design.layers.filter((layer) => layer.id !== action.id)) });
      return { ...next, selectedId: state.selectedId === action.id ? null : state.selectedId };
    }
    case "duplicateLayer": {
      const source = state.design.layers.find((layer) => layer.id === action.id);
      if (!source || source.type === "qr") return state;
      const copy: DesignLayer = { ...source, style: { ...source.style }, id: newLayerId(source.type), x: source.x + 20, y: source.y + 20, locked: false };
      return editorReducer(state, { type: "addLayer", layer: copy });
    }
    case "arrange": {
      const ordered = restack(state.design.layers);
      const index = ordered.findIndex((layer) => layer.id === action.id);
      if (index === -1) return state;
      const [layer] = ordered.splice(index, 1);
      const target =
        action.to === "front" ? ordered.length
        : action.to === "back" ? 0
        : action.to === "forward" ? Math.min(index + 1, ordered.length)
        : Math.max(index - 1, 0);
      ordered.splice(target, 0, layer!);
      if (target === index) return state;
      return commit(state, { ...state.design, layers: ordered.map((l, i) => ({ ...l, zIndex: i + 1 })) });
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      const selectedStillThere = previous.layers.some((layer) => layer.id === state.selectedId);
      return {
        ...state,
        design: previous,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future],
        lastCoalesce: null,
        dirty: true,
        selectedId: selectedStillThere ? state.selectedId : null
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      const selectedStillThere = next.layers.some((layer) => layer.id === state.selectedId);
      return {
        ...state,
        design: next,
        past: [...state.past, state.design],
        future: rest,
        lastCoalesce: null,
        dirty: true,
        selectedId: selectedStillThere ? state.selectedId : null
      };
    }
    case "markSaved":
      return { ...state, dirty: false };
  }
}

// ── Géométrie ────────────────────────────────────────────────────────────

export type Box = { x: number; y: number; width: number; height: number };
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Redimensionnement par une poignée (déplacement dx, dy en unités du billet).
 * `keepRatio` (coin, ou Maj enfoncée) garde les proportions — images et QR code.
 */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, options: { keepRatio?: boolean; minSize?: number } = {}): Box {
  const min = options.minSize ?? 8;
  let { x, y, width, height } = box;
  if (handle.includes("e")) width = box.width + dx;
  if (handle.includes("w")) width = box.width - dx;
  if (handle.includes("s")) height = box.height + dy;
  if (handle.includes("n")) height = box.height - dy;
  width = Math.max(min, width);
  height = Math.max(min, height);

  if (options.keepRatio && box.width > 0 && box.height > 0) {
    const ratio = box.width / box.height;
    const horizontalOnly = handle === "e" || handle === "w";
    const verticalOnly = handle === "n" || handle === "s";
    if (horizontalOnly) height = width / ratio;
    else if (verticalOnly) width = height * ratio;
    else if (width / box.width > height / box.height) height = width / ratio;
    else width = height * ratio;
  }

  if (handle.includes("w")) x = box.x + box.width - width;
  if (handle.includes("n")) y = box.y + box.height - height;
  if ((handle === "e" || handle === "w") && options.keepRatio) y = box.y + (box.height - height) / 2;
  if ((handle === "n" || handle === "s") && options.keepRatio) x = box.x + (box.width - width) / 2;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Angle (degrés) du centre vers le pointeur ; par crans de 15° avec Maj. */
export function rotationFromPointer(center: { x: number; y: number }, pointer: { x: number; y: number }, snap = false): number {
  const degrees = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90;
  const normalized = ((Math.round(degrees) + 540) % 360) - 180;
  return snap ? Math.round(normalized / 15) * 15 : normalized;
}

export type Guides = { vertical: number[]; horizontal: number[] };

/**
 * Repères magnétiques : bords et centres du billet et des autres calques. Le
 * calque déplacé s'y colle à moins de `threshold` unités ; les repères actifs
 * sont renvoyés pour être dessinés.
 */
export function snapMove(box: Box, design: TicketDesign, movingId: string, threshold: number): { x: number; y: number; guides: Guides } {
  const others = design.layers.filter((layer) => layer.visible && layer.id !== movingId);
  const verticals = [0, design.width / 2, design.width, ...others.flatMap((l) => [l.x, l.x + l.width / 2, l.x + l.width])];
  const horizontals = [0, design.height / 2, design.height, ...others.flatMap((l) => [l.y, l.y + l.height / 2, l.y + l.height])];

  const best = (edges: number[], candidates: number[]) => {
    let found: { delta: number; line: number } | null = null;
    for (const edge of edges) {
      for (const line of candidates) {
        const delta = line - edge;
        if (Math.abs(delta) <= threshold && (!found || Math.abs(delta) < Math.abs(found.delta))) found = { delta, line };
      }
    }
    return found;
  };
  const vx = best([box.x, box.x + box.width / 2, box.x + box.width], verticals);
  const hy = best([box.y, box.y + box.height / 2, box.y + box.height], horizontals);
  return {
    x: Math.round(box.x + (vx?.delta ?? 0)),
    y: Math.round(box.y + (hy?.delta ?? 0)),
    guides: { vertical: vx ? [vx.line] : [], horizontal: hy ? [hy.line] : [] }
  };
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Position d'un calque aligné sur le billet. */
export function alignToCanvas(box: Box, design: Pick<TicketDesign, "width" | "height">, how: Alignment): { x: number; y: number } {
  switch (how) {
    case "left": return { x: 0, y: box.y };
    case "center": return { x: Math.round((design.width - box.width) / 2), y: box.y };
    case "right": return { x: design.width - box.width, y: box.y };
    case "top": return { x: box.x, y: 0 };
    case "middle": return { x: box.x, y: Math.round((design.height - box.height) / 2) };
    case "bottom": return { x: box.x, y: design.height - box.height };
  }
}

/**
 * Changement de format : positions mises à l'échelle sur chaque axe, tailles
 * (et textes) au plus petit des deux facteurs pour ne rien déformer.
 */
export function resizeCanvas(design: TicketDesign, width: number, height: number): TicketDesign {
  const sx = width / design.width;
  const sy = height / design.height;
  const s = Math.min(sx, sy);
  return {
    ...design,
    width,
    height,
    layers: design.layers.map((layer) => ({
      ...layer,
      x: Math.round(layer.x * sx),
      y: Math.round(layer.y * sy),
      width: Math.max(4, Math.round(layer.width * s)),
      height: Math.max(2, Math.round(layer.height * s)),
      style: {
        ...layer.style,
        ...(layer.style.fontSize ? { fontSize: Math.max(6, Math.round(layer.style.fontSize * s)) } : {}),
        ...(layer.style.strokeWidth ? { strokeWidth: Math.max(1, Math.round(layer.style.strokeWidth * s)) } : {}),
        ...(layer.style.borderRadius ? { borderRadius: Math.round(layer.style.borderRadius * s) } : {})
      }
    }))
  };
}

/** Taille d'un calque image à son ajout : proportions de l'image, au plus 40 % du billet. */
export function fitImageBox(design: Pick<TicketDesign, "width" | "height">, naturalWidth: number, naturalHeight: number): Box {
  const maxW = design.width * 0.4;
  const maxH = design.height * 0.6;
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1) || 1;
  const width = Math.max(16, Math.round(naturalWidth * scale));
  const height = Math.max(16, Math.round(naturalHeight * scale));
  return { x: Math.round((design.width - width) / 2), y: Math.round((design.height - height) / 2), width, height };
}

/**
 * Hauteur d'un texte après saisie : le cadre s'agrandit pour montrer toutes ses
 * lignes (retours à la ligne compris), sans jamais rétrécir sous la taille choisie.
 */
export function fitTextHeight(layer: Pick<DesignLayer, "height" | "style">, content: string): number {
  const lines = Math.max(1, content.split("\n").length);
  const needed = Math.ceil(lines * (layer.style.fontSize ?? 18) * (layer.style.lineHeight ?? 1.2));
  return Math.max(layer.height, needed);
}
