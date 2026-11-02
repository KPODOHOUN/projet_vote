"use client";

import type { Dispatch } from "react";
import { Circle, Eye, EyeOff, ImageIcon, Lock, Minus, QrCode, Square, Type, Unlock } from "lucide-react";
import type { DesignLayer } from "@/lib/ticket-design";
import type { EditorAction } from "@/lib/ticket-editor";

function layerLabel(layer: DesignLayer, isEn: boolean): string {
  if (layer.type === "text") return layer.content.replace(/\s+/g, " ").trim() || (isEn ? "Text" : "Texte");
  if (layer.type === "qr") return "QR code";
  if (layer.type === "image") return "Image";
  if (layer.style.shape === "ellipse") return isEn ? "Ellipse" : "Ellipse";
  if (layer.style.shape === "line") return isEn ? "Line" : "Ligne";
  return isEn ? "Rectangle" : "Rectangle";
}

function LayerIcon({ layer }: { layer: DesignLayer }) {
  const className = "h-3.5 w-3.5";
  if (layer.type === "text") return <Type className={className} />;
  if (layer.type === "qr") return <QrCode className={className} />;
  if (layer.type === "image") return <ImageIcon className={className} />;
  if (layer.style.shape === "ellipse") return <Circle className={className} />;
  if (layer.style.shape === "line") return <Minus className={className} />;
  return <Square className={className} />;
}

/** Calques du premier plan vers l'arrière-plan, comme dans un logiciel de design. */
export function LayersPanel({ layers, selectedId, dispatch, isEn }: { layers: DesignLayer[]; selectedId: string | null; dispatch: Dispatch<EditorAction>; isEn: boolean }) {
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  if (ordered.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{isEn ? "No layers yet: add text, an image or a shape." : "Aucun calque : ajoutez un texte, une image ou une forme."}</p>;
  }
  return (
    <ul className="flex flex-col gap-1" aria-label={isEn ? "Layers" : "Calques"}>
      {ordered.map((layer) => (
        <li key={layer.id}>
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
              selectedId === layer.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/60"
            } ${layer.visible ? "" : "opacity-50"}`}
          >
            <button type="button" onClick={() => dispatch({ type: "select", id: layer.id })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-muted"><LayerIcon layer={layer} /></span>
              <span className="truncate">{layerLabel(layer, isEn)}</span>
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "updateLayer", id: layer.id, patch: { locked: !layer.locked } })}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={layer.locked ? (isEn ? "Unlock" : "Déverrouiller") : (isEn ? "Lock" : "Verrouiller")}
              title={layer.locked ? (isEn ? "Unlock" : "Déverrouiller") : (isEn ? "Lock" : "Verrouiller")}
            >
              {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-40" />}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "updateLayer", id: layer.id, patch: { visible: !layer.visible } })}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={layer.visible ? (isEn ? "Hide" : "Masquer") : (isEn ? "Show" : "Afficher")}
              title={layer.visible ? (isEn ? "Hide" : "Masquer") : (isEn ? "Show" : "Afficher")}
            >
              {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
