"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCw } from "lucide-react";
import type { DesignLayer, TicketDesign, TicketValues } from "@/lib/ticket-design";
import {
  fitTextHeight,
  HANDLES,
  resizeBox,
  rotationFromPointer,
  snapMove,
  type Box,
  type EditorAction,
  type Guides,
  type Handle
} from "@/lib/ticket-editor";
import { LayerView } from "./layer-view";

type Gesture =
  | { kind: "move"; id: string; startX: number; startY: number; origin: Box }
  | { kind: "resize"; id: string; handle: Handle; startX: number; startY: number; origin: Box; rotation: number; keepRatio: boolean }
  | { kind: "rotate"; id: string; center: { x: number; y: number } };

const HANDLE_POSITION: Record<Handle, string> = {
  nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
  n: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize",
  ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
  e: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  s: "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize",
  sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize",
  w: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize"
};

/** Pixels écran sous lesquels un calque se colle à un repère. */
const SNAP_PX = 6;

export function DesignerCanvas({
  design,
  selectedId,
  dispatch,
  preview,
  editingId,
  onEditText,
  onDropFiles,
  isEn
}: {
  design: TicketDesign;
  selectedId: string | null;
  dispatch: Dispatch<EditorAction>;
  preview: TicketValues | null;
  editingId: string | null;
  onEditText: (id: string | null) => void;
  onDropFiles: (files: File[]) => void;
  isEn: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<Guides>({ vertical: [], horizontal: [] });
  const [dropActive, setDropActive] = useState(false);

  // Le billet tient entièrement dans la zone, quel que soit son format.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      const { width, height } = frame.getBoundingClientRect();
      const next = Math.min((width - 32) / design.width, (height - 32) / design.height);
      setScale(Number.isFinite(next) && next > 0 ? next : 0.5);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [design.width, design.height]);

  useEffect(() => {
    if (!gesture) return;
    const layer = design.layers.find((l) => l.id === gesture.id);
    const onMove = (event: PointerEvent) => {
      if (!layer) return;
      if (gesture.kind === "move") {
        const raw = {
          ...gesture.origin,
          x: gesture.origin.x + (event.clientX - gesture.startX) / scale,
          y: gesture.origin.y + (event.clientY - gesture.startY) / scale
        };
        // Alt : déplacement libre, sans repères.
        const snapped = event.altKey
          ? { x: Math.round(raw.x), y: Math.round(raw.y), guides: { vertical: [], horizontal: [] } }
          : snapMove(raw, design, layer.id, SNAP_PX / scale);
        setGuides(snapped.guides);
        dispatch({ type: "updateLayer", id: layer.id, patch: { x: snapped.x, y: snapped.y }, transient: true });
      } else if (gesture.kind === "resize") {
        // Déplacement ramené dans le repère du calque (s'il est pivoté).
        const angle = (gesture.rotation * Math.PI) / 180;
        const dxScreen = (event.clientX - gesture.startX) / scale;
        const dyScreen = (event.clientY - gesture.startY) / scale;
        const dx = dxScreen * Math.cos(angle) + dyScreen * Math.sin(angle);
        const dy = -dxScreen * Math.sin(angle) + dyScreen * Math.cos(angle);
        const box = resizeBox(gesture.origin, gesture.handle, dx, dy, { keepRatio: gesture.keepRatio !== event.shiftKey });
        dispatch({ type: "updateLayer", id: layer.id, patch: box, transient: true });
      } else {
        const rotation = rotationFromPointer(gesture.center, { x: event.clientX, y: event.clientY }, event.shiftKey);
        dispatch({ type: "updateLayer", id: layer.id, patch: { rotation }, transient: true });
      }
    };
    const onUp = () => {
      setGesture(null);
      setGuides({ vertical: [], horizontal: [] });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gesture, design, scale, dispatch]);

  const boxOf = (layer: DesignLayer): Box => ({ x: layer.x, y: layer.y, width: layer.width, height: layer.height });

  function startMove(event: ReactPointerEvent, layer: DesignLayer) {
    event.stopPropagation();
    if (event.button !== 0) return;
    dispatch({ type: "select", id: layer.id });
    if (layer.locked || editingId === layer.id) return;
    event.preventDefault();
    dispatch({ type: "checkpoint" });
    setGesture({ kind: "move", id: layer.id, startX: event.clientX, startY: event.clientY, origin: boxOf(layer) });
  }

  function startResize(event: ReactPointerEvent, layer: DesignLayer, handle: Handle) {
    event.stopPropagation();
    event.preventDefault();
    dispatch({ type: "checkpoint" });
    // Images et QR code gardent leurs proportions par défaut (Maj pour les libérer).
    const keepRatio = layer.type === "qr" || (layer.type === "image" && handle.length === 2);
    setGesture({ kind: "resize", id: layer.id, handle, startX: event.clientX, startY: event.clientY, origin: boxOf(layer), rotation: layer.rotation ?? 0, keepRatio });
  }

  function startRotate(event: ReactPointerEvent, layer: DesignLayer) {
    event.stopPropagation();
    event.preventDefault();
    const element = (event.currentTarget as HTMLElement).closest("[data-layer]") as HTMLElement | null;
    const rect = element?.getBoundingClientRect();
    if (!rect) return;
    dispatch({ type: "checkpoint" });
    setGesture({ kind: "rotate", id: layer.id, center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
  }

  const layers = [...design.layers].filter((l) => l.visible).sort((a, b) => a.zIndex - b.zIndex);
  const selected = design.layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div
      ref={frameRef}
      className={`relative flex h-full min-h-[320px] w-full items-center justify-center overflow-hidden rounded-2xl bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f8fafc_0%_50%)] [background-size:20px_20px] ${dropActive ? "ring-4 ring-primary/50" : ""}`}
      onPointerDown={() => { dispatch({ type: "select", id: null }); onEditText(null); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropActive(true); } }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/"));
        if (files.length) onDropFiles(files);
      }}
    >
      <div
        className="relative shadow-2xl"
        style={{
          width: design.width * scale,
          height: design.height * scale,
          ...(design.background.type === "gradient" ? { backgroundImage: design.background.value } : { backgroundColor: design.background.value }),
          touchAction: "none"
        }}
        role="application"
        aria-label={isEn ? "Ticket canvas" : "Zone de dessin du billet"}
      >
        <div className="absolute inset-0 overflow-hidden">
          {design.backgroundImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- fond importé par l'organisateur, recadré en « cover » comme au rendu
            <img src={design.backgroundImage} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" />
          ) : null}
          {layers.map((layer) => (
            <div
              key={layer.id}
              data-layer={layer.id}
              onPointerDown={(event) => startMove(event, layer)}
              onDoubleClick={() => { if (layer.type === "text" && !layer.locked) onEditText(layer.id); }}
              className={`absolute ${layer.locked ? "cursor-default" : "cursor-move"}`}
              style={{
                left: layer.x * scale,
                top: layer.y * scale,
                width: layer.width * scale,
                height: layer.height * scale,
                transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
                opacity: layer.style.opacity ?? 1
              }}
            >
              {editingId === layer.id && layer.type === "text" ? (
                <textarea
                  autoFocus
                  defaultValue={layer.content}
                  maxLength={500}
                  onPointerDown={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    const content = event.target.value;
                    if (content !== layer.content) {
                      dispatch({ type: "updateLayer", id: layer.id, patch: { content, height: fitTextHeight(layer, content) } });
                    }
                    onEditText(null);
                  }}
                  onKeyDown={(event) => { if (event.key === "Escape") (event.target as HTMLTextAreaElement).blur(); }}
                  className="h-full w-full resize-none border-0 bg-black/20 p-0 outline-none"
                  style={{
                    fontSize: (layer.style.fontSize ?? 18) * scale,
                    color: layer.style.color ?? "#ffffff",
                    lineHeight: layer.style.lineHeight ?? 1.2,
                    textAlign: layer.style.textAlign ?? "left"
                  }}
                />
              ) : (
                <LayerView layer={layer} scale={scale} preview={preview} />
              )}
            </div>
          ))}
        </div>

        {/* Cadre de sélection, au-dessus de tout (même hors du billet). */}
        {selected && selected.visible && editingId !== selected.id ? (
          <div
            data-layer={selected.id}
            className="pointer-events-none absolute"
            style={{
              left: selected.x * scale,
              top: selected.y * scale,
              width: selected.width * scale,
              height: selected.height * scale,
              transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined
            }}
          >
            <div className={`absolute inset-0 border-2 ${selected.locked ? "border-dashed border-slate-400" : "border-indigo-500"}`} />
            {!selected.locked ? (
              <>
                {HANDLES.filter((h) => !(selected.type === "shape" && selected.style.shape === "line" && (h.includes("n") || h.includes("s")) && h.length === 1)).map((handle) => (
                  <span
                    key={handle}
                    onPointerDown={(event) => startResize(event, selected, handle)}
                    className={`pointer-events-auto absolute h-3 w-3 rounded-full border-2 border-white bg-indigo-500 shadow ${HANDLE_POSITION[handle]}`}
                    aria-hidden="true"
                  />
                ))}
                <button
                  type="button"
                  onPointerDown={(event) => startRotate(event, selected)}
                  className="pointer-events-auto absolute -top-9 left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-600 shadow"
                  aria-label={isEn ? "Rotate (Shift: 15° steps)" : "Pivoter (Maj : par 15°)"}
                  title={isEn ? "Rotate (Shift: 15° steps)" : "Pivoter (Maj : par 15°)"}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {guides.vertical.map((x) => (
          <span key={`v${x}`} className="pointer-events-none absolute top-0 h-full w-px bg-pink-500" style={{ left: x * scale }} />
        ))}
        {guides.horizontal.map((y) => (
          <span key={`h${y}`} className="pointer-events-none absolute left-0 h-px w-full bg-pink-500" style={{ top: y * scale }} />
        ))}
      </div>
      {dropActive ? (
        <p className="pointer-events-none absolute bottom-4 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">
          {isEn ? "Drop to add the image" : "Déposez pour ajouter l'image"}
        </p>
      ) : null}
    </div>
  );
}
