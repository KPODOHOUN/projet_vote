"use client";

import type { Dispatch, ReactNode } from "react";
import {
  AlignCenter, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignLeft, AlignRight,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDownToLine, ArrowUpToLine,
  Bold, ChevronDown, ChevronUp, Copy, ImageIcon, Lock, Trash2, Underline, Unlock, X
} from "lucide-react";
import {
  BACKGROUND_PRESETS, TICKET_FIELDS, TICKET_FONTS, TICKET_FORMATS, TICKET_TEMPLATES,
  type DesignLayer, type LayerStyle, type TicketDesign
} from "@/lib/ticket-design";
import { alignToCanvas, fitTextHeight, resizeCanvas, type Alignment, type EditorAction } from "@/lib/ticket-editor";
import { paintStyle } from "./layer-view";

const inputClass = "h-8 w-full rounded-lg border border-border/60 bg-background px-2 text-xs font-semibold";
const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        className={inputClass}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

function ColorField({ label, value, onChange, allowNone, isEn }: { label: string; value: string | undefined; onChange: (value: string) => void; allowNone?: boolean; isEn: boolean }) {
  const isHex = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={isHex ? value : "#ffffff"} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer rounded-lg border border-border/60" aria-label={label} />
        <input type="text" value={value ?? ""} maxLength={7} onChange={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) onChange(event.target.value); }} className={`${inputClass} font-mono`} aria-label={`${label} (hex)`} />
        {allowNone ? (
          <button type="button" onClick={() => onChange("transparent")} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${value === "transparent" ? "border-primary bg-primary/10" : "border-border/60"}`}>
            {isEn ? "None" : "Aucun"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, active, children, danger }: { label: string; onClick: () => void; active?: boolean; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : danger ? "border-border/60 text-destructive hover:bg-destructive/10" : "border-border/60 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** Réglages du billet entier : modèles, format, fond. */
function DocumentPanel({ design, dispatch, onPickBackground, isEn }: { design: TicketDesign; dispatch: Dispatch<EditorAction>; onPickBackground: () => void; isEn: boolean }) {
  const format = TICKET_FORMATS.find((f) => f.width === design.width && f.height === design.height);
  return (
    <div className="space-y-4">
      <Section title={isEn ? "Templates" : "Modèles"}>
        <div className="grid grid-cols-3 gap-2">
          {TICKET_TEMPLATES.map((template) => {
            const preview = template.build();
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  if (design.layers.length === 0 || window.confirm(isEn ? "Replace the current design with this template?" : "Remplacer le design actuel par ce modèle ?")) {
                    dispatch({ type: "replaceDesign", design: template.build() });
                  }
                }}
                className="group flex flex-col items-center gap-1.5 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* Cadre identique pour chaque modèle, paysage ou portrait : la rangée reste alignée. */}
                <span className="flex h-16 w-full items-center justify-center rounded-lg border border-border/60 bg-muted/40 p-2 transition-colors group-hover:border-primary/50">
                  <span className="block max-h-full max-w-full rounded shadow-sm" style={{ aspectRatio: `${preview.width} / ${preview.height}`, height: preview.height >= preview.width ? "100%" : undefined, width: preview.width > preview.height ? "100%" : undefined, ...paintStyle(preview.background.value) }} />
                </span>
                {isEn ? template.en : template.fr}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{isEn ? "Ctrl+Z undoes a template change." : "Ctrl+Z annule le changement de modèle."}</p>
      </Section>

      <Section title={isEn ? "Format" : "Format"}>
        <select
          className={inputClass}
          value={format?.id ?? "custom"}
          onChange={(event) => {
            const next = TICKET_FORMATS.find((f) => f.id === event.target.value);
            if (next) dispatch({ type: "replaceDesign", design: resizeCanvas(design, next.width, next.height) });
          }}
          aria-label={isEn ? "Ticket format" : "Format du billet"}
        >
          {!format ? <option value="custom">{isEn ? `Custom (${design.width} × ${design.height})` : `Personnalisé (${design.width} × ${design.height})`}</option> : null}
          {TICKET_FORMATS.map((f) => <option key={f.id} value={f.id}>{isEn ? f.en : f.fr} — {f.width} × {f.height}</option>)}
        </select>
      </Section>

      <Section title={isEn ? "Background" : "Fond"}>
        <div className="grid grid-cols-5 gap-1.5">
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => dispatch({ type: "setDesign", patch: { background: preset } })}
              className={`h-8 rounded-md border ${design.background.value === preset.value ? "ring-2 ring-primary" : "border-border/60"}`}
              style={paintStyle(preset.value)}
              aria-label={preset.value}
              title={preset.value}
            />
          ))}
        </div>
        <ColorField
          label={isEn ? "Custom colour" : "Couleur personnalisée"}
          value={design.background.type === "color" ? design.background.value : undefined}
          onChange={(value) => dispatch({ type: "setDesign", patch: { background: { type: "color", value } }, coalesce: "background" })}
          isEn={isEn}
        />
        <div className="flex gap-2">
          <button type="button" onClick={onPickBackground} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border/60 py-2 text-xs font-semibold hover:bg-muted">
            <ImageIcon className="h-3.5 w-3.5" /> {design.backgroundImage ? (isEn ? "Change image" : "Changer l'image") : (isEn ? "Background image" : "Image de fond")}
          </button>
          {design.backgroundImage ? (
            <button type="button" onClick={() => dispatch({ type: "setDesign", patch: { backgroundImage: null } })} className="rounded-lg border border-border/60 px-2 text-destructive hover:bg-destructive/10" aria-label={isEn ? "Remove background image" : "Retirer l'image de fond"}>
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

/** Réglages du calque sélectionné. */
function LayerPanel({ layer, design, dispatch, onReplaceImage, isEn }: { layer: DesignLayer; design: TicketDesign; dispatch: Dispatch<EditorAction>; onReplaceImage: (id: string) => void; isEn: boolean }) {
  const set = (patch: Partial<Omit<DesignLayer, "id" | "style">>, field?: string) =>
    dispatch({ type: "updateLayer", id: layer.id, patch, coalesce: field ? `${layer.id}:${field}` : undefined });
  const setStyle = (patch: Partial<LayerStyle>, field?: string) =>
    dispatch({ type: "updateStyle", id: layer.id, patch, coalesce: field ? `${layer.id}:${field}` : undefined });
  const align = (how: Alignment) => set(alignToCanvas(layer, design, how));
  const square = layer.type === "qr";

  return (
    <div className="space-y-4">
      <Section title={isEn ? "Arrange" : "Disposition"}>
        <div className="flex gap-1">
          <IconButton label={isEn ? "Bring to front" : "Premier plan"} onClick={() => dispatch({ type: "arrange", id: layer.id, to: "front" })}><ArrowUpToLine className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Bring forward" : "Avancer"} onClick={() => dispatch({ type: "arrange", id: layer.id, to: "forward" })}><ChevronUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Send backward" : "Reculer"} onClick={() => dispatch({ type: "arrange", id: layer.id, to: "backward" })}><ChevronDown className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Send to back" : "Arrière-plan"} onClick={() => dispatch({ type: "arrange", id: layer.id, to: "back" })}><ArrowDownToLine className="h-3.5 w-3.5" /></IconButton>
        </div>
        <div className="flex gap-1">
          <IconButton label={isEn ? "Align left" : "Aligner à gauche"} onClick={() => align("left")}><AlignHorizontalJustifyStart className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Centre horizontally" : "Centrer horizontalement"} onClick={() => align("center")}><AlignHorizontalJustifyCenter className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Align right" : "Aligner à droite"} onClick={() => align("right")}><AlignHorizontalJustifyEnd className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Align top" : "Aligner en haut"} onClick={() => align("top")}><AlignVerticalJustifyStart className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Centre vertically" : "Centrer verticalement"} onClick={() => align("middle")}><AlignVerticalJustifyCenter className="h-3.5 w-3.5" /></IconButton>
          <IconButton label={isEn ? "Align bottom" : "Aligner en bas"} onClick={() => align("bottom")}><AlignVerticalJustifyEnd className="h-3.5 w-3.5" /></IconButton>
        </div>
        <div className="flex gap-1">
          <IconButton label={layer.locked ? (isEn ? "Unlock" : "Déverrouiller") : (isEn ? "Lock" : "Verrouiller")} active={layer.locked ?? false} onClick={() => set({ locked: !layer.locked })}>
            {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </IconButton>
          {layer.type !== "qr" ? (
            <IconButton label={isEn ? "Duplicate (Ctrl+D)" : "Dupliquer (Ctrl+D)"} onClick={() => dispatch({ type: "duplicateLayer", id: layer.id })}><Copy className="h-3.5 w-3.5" /></IconButton>
          ) : null}
          <IconButton label={isEn ? "Delete (Del)" : "Supprimer (Suppr)"} danger onClick={() => dispatch({ type: "removeLayer", id: layer.id })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      </Section>

      <Section title={isEn ? "Position and size" : "Position et taille"}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={layer.x} min={-10_000} max={10_000} onChange={(x) => set({ x }, "x")} />
          <NumberField label="Y" value={layer.y} min={-10_000} max={10_000} onChange={(y) => set({ y }, "y")} />
          <NumberField label={isEn ? "Width" : "Largeur"} value={layer.width} min={4} max={10_000} onChange={(width) => set(square ? { width, height: width } : { width }, "width")} />
          <NumberField label={isEn ? "Height" : "Hauteur"} value={layer.height} min={2} max={10_000} onChange={(height) => set(square ? { width: height, height } : { height }, "height")} />
          <NumberField label={isEn ? "Rotation (°)" : "Rotation (°)"} value={layer.rotation ?? 0} min={-180} max={180} onChange={(rotation) => set({ rotation }, "rotation")} />
          <label className="block">
            <span className={labelClass}>{isEn ? "Opacity" : "Opacité"} {Math.round((layer.style.opacity ?? 1) * 100)} %</span>
            <input type="range" min={0} max={100} value={Math.round((layer.style.opacity ?? 1) * 100)} onChange={(event) => setStyle({ opacity: Number(event.target.value) / 100 }, "opacity")} className="h-8 w-full" />
          </label>
        </div>
      </Section>

      {layer.type === "text" ? (
        <Section title={isEn ? "Text" : "Texte"}>
          <textarea
            value={layer.content}
            maxLength={500}
            rows={3}
            onChange={(event) => set({ content: event.target.value, height: fitTextHeight(layer, event.target.value) }, "content")}
            className="w-full rounded-lg border border-border/60 bg-background p-2 text-xs font-semibold"
            aria-label={isEn ? "Text content" : "Contenu du texte"}
          />
          <select
            className={inputClass}
            value=""
            onChange={(event) => { if (event.target.value) set({ content: `${layer.content}${layer.content.endsWith(" ") || !layer.content ? "" : " "}${event.target.value}` }); }}
            aria-label={isEn ? "Insert a buyer field" : "Insérer un champ de l'acheteur"}
          >
            <option value="">{isEn ? "Insert a buyer field…" : "Insérer un champ de l'acheteur…"}</option>
            {TICKET_FIELDS.map((field) => <option key={field.token} value={field.token}>{isEn ? field.en : field.fr}</option>)}
          </select>
          <select className={inputClass} value={layer.style.fontFamily ?? "inter"} onChange={(event) => setStyle({ fontFamily: event.target.value as NonNullable<LayerStyle["fontFamily"]> })} aria-label={isEn ? "Font" : "Police"}>
            {TICKET_FONTS.map((font) => <option key={font.id} value={font.id} style={{ fontFamily: `var(${font.cssVar})` }}>{font.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={isEn ? "Size" : "Taille"} value={layer.style.fontSize ?? 18} min={6} max={400} onChange={(fontSize) => setStyle({ fontSize }, "fontSize")} />
            <NumberField label={isEn ? "Letter spacing" : "Espacement"} value={layer.style.letterSpacing ?? 0} min={-20} max={100} step={0.5} onChange={(letterSpacing) => setStyle({ letterSpacing }, "letterSpacing")} />
            <NumberField label={isEn ? "Line height" : "Interligne"} value={layer.style.lineHeight ?? 1.2} min={0.5} max={4} step={0.05} onChange={(lineHeight) => setStyle({ lineHeight }, "lineHeight")} />
          </div>
          <div className="flex gap-1">
            <IconButton label={isEn ? "Bold" : "Gras"} active={Number.parseInt(layer.style.fontWeight ?? "400", 10) >= 600} onClick={() => setStyle({ fontWeight: Number.parseInt(layer.style.fontWeight ?? "400", 10) >= 600 ? "400" : "700" })}><Bold className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={isEn ? "Underline" : "Souligné"} active={layer.style.textDecoration === "underline"} onClick={() => setStyle({ textDecoration: layer.style.textDecoration === "underline" ? "none" : "underline" })}><Underline className="h-3.5 w-3.5" /></IconButton>
            {(["left", "center", "right"] as const).map((textAlign) => (
              <IconButton key={textAlign} label={textAlign} active={(layer.style.textAlign ?? "left") === textAlign} onClick={() => setStyle({ textAlign })}>
                {textAlign === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : textAlign === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
              </IconButton>
            ))}
          </div>
          <ColorField label={isEn ? "Colour" : "Couleur"} value={layer.style.color ?? "#ffffff"} onChange={(color) => setStyle({ color }, "color")} isEn={isEn} />
        </Section>
      ) : null}

      {layer.type === "image" ? (
        <Section title="Image">
          <select className={inputClass} value={layer.style.objectFit ?? "contain"} onChange={(event) => setStyle({ objectFit: event.target.value as NonNullable<LayerStyle["objectFit"]> })} aria-label={isEn ? "Fit" : "Cadrage"}>
            <option value="contain">{isEn ? "Fit whole image" : "Image entière"}</option>
            <option value="cover">{isEn ? "Fill (crop)" : "Remplir (rogner)"}</option>
            <option value="fill">{isEn ? "Stretch" : "Étirer"}</option>
          </select>
          <NumberField label={isEn ? "Corner radius" : "Arrondi des coins"} value={layer.style.borderRadius ?? 0} min={0} max={1000} onChange={(borderRadius) => setStyle({ borderRadius }, "borderRadius")} />
          <button type="button" onClick={() => onReplaceImage(layer.id)} className="flex w-full items-center justify-center gap-1 rounded-lg border border-border/60 py-2 text-xs font-semibold hover:bg-muted">
            <ImageIcon className="h-3.5 w-3.5" /> {isEn ? "Replace image" : "Remplacer l'image"}
          </button>
        </Section>
      ) : null}

      {layer.type === "shape" ? (
        <Section title={isEn ? "Shape" : "Forme"}>
          <select className={inputClass} value={layer.style.shape ?? "rect"} onChange={(event) => setStyle({ shape: event.target.value as NonNullable<LayerStyle["shape"]> })} aria-label={isEn ? "Shape" : "Forme"}>
            <option value="rect">Rectangle</option>
            <option value="ellipse">{isEn ? "Ellipse" : "Ellipse"}</option>
            <option value="line">{isEn ? "Line" : "Ligne"}</option>
          </select>
          {layer.style.shape !== "line" ? (
            <ColorField label={isEn ? "Fill" : "Remplissage"} value={layer.style.fill ?? "#ffffff"} onChange={(fill) => setStyle({ fill }, "fill")} allowNone isEn={isEn} />
          ) : null}
          <ColorField label={layer.style.shape === "line" ? (isEn ? "Colour" : "Couleur") : (isEn ? "Border" : "Bordure")} value={layer.style.stroke ?? "#ffffff"} onChange={(stroke) => setStyle({ stroke }, "stroke")} isEn={isEn} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={isEn ? "Thickness" : "Épaisseur"} value={layer.style.strokeWidth ?? 0} min={0} max={200} onChange={(strokeWidth) => setStyle({ strokeWidth }, "strokeWidth")} />
            {(layer.style.shape ?? "rect") === "rect" ? (
              <NumberField label={isEn ? "Corner radius" : "Arrondi"} value={layer.style.borderRadius ?? 0} min={0} max={1000} onChange={(borderRadius) => setStyle({ borderRadius }, "borderRadius")} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {layer.type === "qr" ? (
        <p className="rounded-lg bg-muted/60 p-2 text-[11px] leading-snug text-muted-foreground">
          {isEn
            ? "Each buyer's own entry QR code will be printed here. It stays square and on a white background so it always scans."
            : "Le QR code d'entrée de chaque acheteur sera imprimé ici. Il reste carré et sur fond blanc pour toujours être lisible au scan."}
        </p>
      ) : null}
    </div>
  );
}

export function PropertiesPanel({
  design, selected, dispatch, onPickBackground, onReplaceImage, isEn
}: {
  design: TicketDesign;
  selected: DesignLayer | null;
  dispatch: Dispatch<EditorAction>;
  onPickBackground: () => void;
  onReplaceImage: (id: string) => void;
  isEn: boolean;
}) {
  return selected
    ? <LayerPanel key={selected.id} layer={selected} design={design} dispatch={dispatch} onReplaceImage={onReplaceImage} isEn={isEn} />
    : <DocumentPanel design={design} dispatch={dispatch} onPickBackground={onPickBackground} isEn={isEn} />;
}
