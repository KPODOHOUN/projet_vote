"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Braces, Circle, Eye, EyeOff, ImageIcon, Layers, Loader2, Minus, Palette, QrCode, Redo2, Save, Square, Type, Undo2
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { Button, LoadingState } from "@/components/ui";
import { DashboardBreadcrumb } from "@/components/dashboard-breadcrumb";
import { showToast } from "@/lib/toast";
import { uploadCandidatePhoto } from "@/lib/upload";
import {
  defaultTicketDesign, isBlankDesign, isUnrenderableImage, newLayerId, TICKET_FIELDS,
  type DesignLayer, type ShapeKind, type TicketDesign, type TicketValues
} from "@/lib/ticket-design";
import { editorReducer, fitImageBox, initialEditorState } from "@/lib/ticket-editor";
import { DesignerCanvas } from "@/components/ticket-designer/designer-canvas";
import { LayersPanel } from "@/components/ticket-designer/layers-panel";
import { PropertiesPanel } from "@/components/ticket-designer/properties-panel";

type TicketTypeInfo = {
  id: string;
  name: string;
  priceCfa: number;
  event?: { title: string; startsAt: string } | null;
};

/** Limite de l'API (design de billet). */
const MAX_LAYERS = 50;

type UploadTarget = { kind: "add" } | { kind: "background" } | { kind: "replace"; id: string };

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable));
}

/**
 * Le rendu du billet ne lit pas le WebP : converti en PNG (transparence gardée)
 * avant l'import. Les autres formats passent tels quels.
 */
async function toRenderableImage(file: File): Promise<File> {
  if (file.type !== "image/webp") return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new File([blob], file.name.replace(/\.webp$/i, "") + ".png", { type: "image/png" }) : file;
}

async function naturalSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 400, height: 400 };
  }
}

export default function TicketDesignerPage() {
  const router = useRouter();
  const { eventId, typeId } = useParams<{ eventId: string; typeId: string }>();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [ticketType, setTicketType] = useState<TicketTypeInfo | null>(null);
  const [state, dispatch] = useReducer(editorReducer, initialEditorState(defaultTicketDesign()));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<UploadTarget>({ kind: "add" });

  const { design, selectedId } = state;
  const selected = design.layers.find((layer) => layer.id === selectedId) ?? null;

  useEffect(() => {
    // Réponse arrivée après un nouveau chargement (ou un démontage) : ignorée, elle
    // écraserait les modifications déjà faites.
    let stale = false;
    async function load() {
      try {
        const token = getStoredToken();
        if (!token) { router.push("/login"); return; }
        const headers = { Authorization: `Bearer ${token}` };
        const [typeData, saved] = await Promise.all([
          apiFetch<TicketTypeInfo>(`/events/${eventId}/ticket-types/${typeId}`, { headers }),
          apiFetch<TicketDesign>(`/events/${eventId}/ticket-types/${typeId}/design`, { headers })
        ]);
        if (stale) return;
        setTicketType(typeData);
        // Jamais dessiné : on part du billet que l'acheteur recevrait aujourd'hui.
        dispatch({ type: "load", design: isBlankDesign(saved) ? defaultTicketDesign() : saved });
      } catch {
        if (stale) return;
        showToast.error(isEn ? "Failed to load ticket design" : "Échec du chargement du design");
        router.push(`/dashboard/events/${eventId}/tickets`);
      } finally {
        if (!stale) setIsLoading(false);
      }
    }
    void load();
    return () => { stale = true; };
    // Chargé une fois par billet : relancer au changement de langue écraserait le design non enregistré.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, typeId]);

  // Modifications non enregistrées : le navigateur demande confirmation avant de quitter.
  useEffect(() => {
    if (!state.dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.dirty]);

  const previewValues: TicketValues | null = useMemo(
    () =>
      preview && ticketType
        ? {
            ticketId: "cm1exemple0000A1B2C3",
            number: 42,
            holderName: "Awa Kouassi",
            ticketTypeName: ticketType.name,
            eventTitle: ticketType.event?.title ?? (isEn ? "Your event" : "Votre événement"),
            eventStartsAt: ticketType.event?.startsAt ?? null,
            amountCfa: ticketType.priceCfa
          }
        : null,
    [preview, ticketType, isEn]
  );

  const canAdd = design.layers.length < MAX_LAYERS;
  const addLayer = useCallback(
    (layer: Omit<DesignLayer, "zIndex">) => {
      if (design.layers.length >= MAX_LAYERS) {
        showToast.error(isEn ? `${MAX_LAYERS} layers maximum per ticket.` : `${MAX_LAYERS} calques au plus par billet.`);
        return;
      }
      dispatch({ type: "addLayer", layer: { ...layer, zIndex: 0 } });
    },
    [design.layers.length, isEn]
  );

  function addText(content = isEn ? "Your text" : "Votre texte") {
    const width = Math.round(design.width * 0.4);
    addLayer({
      id: newLayerId("text"), type: "text", content, visible: true,
      x: Math.round((design.width - width) / 2), y: Math.round(design.height / 2 - 30), width, height: 60,
      style: { fontSize: Math.round(design.height / 12), fontWeight: "700", color: "#ffffff", textAlign: "center", fontFamily: "inter", lineHeight: 1.2 }
    });
  }

  function addShape(shape: ShapeKind) {
    const size = Math.round(Math.min(design.width, design.height) * 0.3);
    addLayer({
      id: newLayerId("shape"), type: "shape", content: "", visible: true,
      x: Math.round((design.width - (shape === "line" ? size * 2 : size)) / 2), y: Math.round((design.height - (shape === "line" ? 4 : size)) / 2),
      width: shape === "line" ? size * 2 : size, height: shape === "line" ? 4 : size,
      style: shape === "line"
        ? { shape, stroke: "#ffffff", strokeWidth: 4 }
        : { shape, fill: "#ffffff", stroke: "#ffffff", strokeWidth: 0, borderRadius: shape === "rect" ? 16 : 0, opacity: 0.9 }
    });
  }

  function addQr() {
    const existing = design.layers.find((layer) => layer.type === "qr");
    if (existing) { dispatch({ type: "select", id: existing.id }); return; }
    const side = Math.round(Math.min(design.height * 0.6, design.width * 0.3));
    addLayer({ id: newLayerId("qr"), type: "qr", content: "", visible: true, x: design.width - side - 40, y: Math.round((design.height - side) / 2), width: side, height: side, style: {} });
  }

  function pickImage(target: UploadTarget) {
    if (target.kind === "add" && !canAdd) {
      showToast.error(isEn ? `${MAX_LAYERS} layers maximum per ticket.` : `${MAX_LAYERS} calques au plus par billet.`);
      return;
    }
    uploadTarget.current = target;
    fileRef.current?.click();
  }

  const uploadImages = useCallback(
    async (files: File[], target: UploadTarget) => {
      const token = getStoredToken();
      if (!token || files.length === 0) return;
      setUploading(true);
      try {
        for (const original of target.kind === "add" ? files : files.slice(0, 1)) {
          const file = await toRenderableImage(original);
          const [url, size] = await Promise.all([uploadCandidatePhoto(file, token), naturalSize(file)]);
          if (target.kind === "background") {
            dispatch({ type: "setDesign", patch: { backgroundImage: url } });
          } else if (target.kind === "replace") {
            dispatch({ type: "updateLayer", id: target.id, patch: { content: url } });
          } else {
            addLayer({ id: newLayerId("image"), type: "image", content: url, visible: true, ...fitImageBox(design, size.width, size.height), style: { objectFit: "contain" } });
          }
        }
        showToast.success(isEn ? "Image added" : "Image ajoutée");
      } catch (error) {
        showToast.error(error instanceof Error && error.message ? error.message : isEn ? "Upload failed" : "Échec de l'import");
      } finally {
        setUploading(false);
      }
    },
    [addLayer, design, isEn]
  );

  const save = useCallback(async () => {
    const token = getStoredToken();
    if (!token || isSaving) return;
    setIsSaving(true);
    try {
      await apiFetch(`/events/${eventId}/ticket-types/${typeId}/design`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(design)
      });
      dispatch({ type: "markSaved" });
      showToast.success(isEn ? "Design saved: buyers will receive this ticket." : "Design enregistré : les acheteurs recevront ce billet.");
    } catch (error) {
      showToast.error(error instanceof ApiError ? error.message : isEn ? "Failed to save" : "Échec de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  }, [design, eventId, isEn, isSaving, typeId]);

  // Raccourcis : Suppr, Ctrl+Z / Ctrl+Maj+Z / Ctrl+Y, Ctrl+D, Ctrl+S, flèches (Maj : ×10), Entrée, Échap.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); return; }
      if (isTyping(event.target)) return;
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); return; }
      if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "redo" }); return; }
      if (event.key === "Escape") { dispatch({ type: "select", id: null }); return; }
      if (!selected) return;
      if (mod && event.key.toLowerCase() === "d") { event.preventDefault(); dispatch({ type: "duplicateLayer", id: selected.id }); return; }
      if (selected.locked) return;
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); dispatch({ type: "removeLayer", id: selected.id }); return; }
      if (event.key === "Enter" && selected.type === "text") { event.preventDefault(); setEditingId(selected.id); return; }
      const step = event.shiftKey ? 10 : 1;
      const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const delta = move[event.key];
      if (delta) {
        event.preventDefault();
        dispatch({ type: "updateLayer", id: selected.id, patch: { x: selected.x + delta[0], y: selected.y + delta[1] }, coalesce: `${selected.id}:nudge` });
      }
    };
    // Coller une image (copiée depuis un autre logiciel) l'ajoute au billet.
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
      if (files.length) { event.preventDefault(); void uploadImages(files, { kind: "add" }); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [save, selected, uploadImages]);

  function leave() {
    if (state.dirty && !window.confirm(isEn ? "Leave without saving your changes?" : "Quitter sans enregistrer vos modifications ?")) return;
    router.push(`/dashboard/events/${eventId}/tickets`);
  }

  if (isLoading) return <LoadingState variant="rows" count={3} label={isEn ? "Loading designer..." : "Chargement de l'éditeur..."} />;
  if (!ticketType) return null;

  const tool = "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-40";

  // Hauteur de l'écran moins l'en-tête du tableau de bord : tout l'éditeur tient sans défiler.
  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-12.5rem)] lg:min-h-[560px]">
      {/* Même en-tête que les autres pages billets : fil d'Ariane et titre à gauche, action à droite. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <DashboardBreadcrumb
            isEn={isEn}
            items={[
              { label: isEn ? "Events" : "Événements", href: "/dashboard/events" },
              { label: isEn ? "Tickets" : "Billets", href: `/dashboard/events/${eventId}/tickets` },
              { label: ticketType.name }
            ]}
          />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="-ml-3 h-10 w-10 p-0" onClick={leave} aria-label={isEn ? "Back to tickets" : "Retour aux billets"}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="truncate text-2xl font-extrabold tracking-tight">
              {isEn ? "Ticket design" : "Design du billet"} · {ticketType.name}
            </h1>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          {state.dirty ? <span className="text-xs font-semibold text-amber-700">{isEn ? "Unsaved changes" : "Modifications non enregistrées"}</span> : null}
          <Button onClick={() => void save()} disabled={isSaving || !state.dirty}>
            {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {isSaving ? (isEn ? "Saving..." : "Enregistrement...") : isEn ? "Save" : "Enregistrer"}
          </Button>
        </div>
      </header>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-card p-1.5" role="toolbar" aria-label={isEn ? "Design tools" : "Outils de design"}>
        <button type="button" className={tool} onClick={() => addText()} disabled={!canAdd}><Type className="h-4 w-4" />{isEn ? "Text" : "Texte"}</button>
        <button type="button" className={tool} onClick={() => pickImage({ kind: "add" })} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}Image
        </button>
        <button type="button" className={tool} onClick={() => addShape("rect")} disabled={!canAdd}><Square className="h-4 w-4" />Rectangle</button>
        <button type="button" className={tool} onClick={() => addShape("ellipse")} disabled={!canAdd}><Circle className="h-4 w-4" />Ellipse</button>
        <button type="button" className={tool} onClick={() => addShape("line")} disabled={!canAdd}><Minus className="h-4 w-4" />{isEn ? "Line" : "Ligne"}</button>
        <button type="button" className={tool} onClick={addQr}><QrCode className="h-4 w-4" />QR code</button>
        <label className={`${tool} cursor-pointer`}>
          <Braces className="h-4 w-4" />
          <select
            value=""
            onChange={(event) => { if (event.target.value) addText(event.target.value); }}
            className="bg-transparent text-xs font-semibold outline-none"
            aria-label={isEn ? "Add a buyer field" : "Ajouter un champ de l'acheteur"}
          >
            <option value="">{isEn ? "Buyer field" : "Champ de l'acheteur"}</option>
            {TICKET_FIELDS.map((field) => <option key={field.token} value={field.token}>{isEn ? field.en : field.fr}</option>)}
          </select>
        </label>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <button type="button" className={tool} onClick={() => dispatch({ type: "undo" })} disabled={state.past.length === 0} title={isEn ? "Undo (Ctrl+Z)" : "Annuler (Ctrl+Z)"} aria-label={isEn ? "Undo" : "Annuler"}><Undo2 className="h-4 w-4" /></button>
        <button type="button" className={tool} onClick={() => dispatch({ type: "redo" })} disabled={state.future.length === 0} title={isEn ? "Redo (Ctrl+Shift+Z)" : "Rétablir (Ctrl+Maj+Z)"} aria-label={isEn ? "Redo" : "Rétablir"}><Redo2 className="h-4 w-4" /></button>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <button type="button" className={`${tool} ${preview ? "bg-primary/10 text-primary" : ""}`} onClick={() => setPreview((v) => !v)} aria-pressed={preview}>
          {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {isEn ? "Preview with a buyer" : "Aperçu avec un acheteur"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void uploadImages(files, uploadTarget.current);
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside className="order-2 flex max-h-72 flex-shrink-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-border/60 bg-card p-3 lg:order-1 lg:max-h-none lg:w-60">
          <h2 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Layers className="h-3.5 w-3.5" />{isEn ? "Layers" : "Calques"}</h2>
          <LayersPanel layers={design.layers} selectedId={selectedId} dispatch={dispatch} isEn={isEn} />
          {[design.backgroundImage, ...design.layers.filter((l) => l.type === "image").map((l) => l.content)].some(isUnrenderableImage) ? (
            <p className="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-900">
              {isEn
                ? "An image is in WebP format and will not appear on the ticket: replace it (PNG or JPEG)."
                : "Une image est au format WebP et n'apparaîtra pas sur le billet : remplacez-la (PNG ou JPEG)."}
            </p>
          ) : null}
          {!design.layers.some((layer) => layer.type === "qr") ? (
            <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
              {isEn ? "No QR code placed: it will be added at the bottom right." : "Aucun QR code placé : il sera ajouté en bas à droite."}
            </p>
          ) : null}
        </aside>

        <main className="order-1 min-h-[360px] min-w-0 flex-1 lg:order-2">
          <DesignerCanvas
            design={design}
            selectedId={selectedId}
            dispatch={dispatch}
            preview={previewValues}
            editingId={editingId}
            onEditText={setEditingId}
            onDropFiles={(files) => void uploadImages(files, { kind: "add" })}
            isEn={isEn}
          />
        </main>

        <aside className="order-3 flex-shrink-0 overflow-y-auto rounded-2xl border border-border/60 bg-card p-3 lg:w-72">
          <h2 className="mb-3 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />{selected ? (isEn ? "Selected layer" : "Calque sélectionné") : (isEn ? "Ticket" : "Billet")}
          </h2>
          <PropertiesPanel
            design={design}
            selected={selected}
            dispatch={dispatch}
            onPickBackground={() => pickImage({ kind: "background" })}
            onReplaceImage={(id) => pickImage({ kind: "replace", id })}
            isEn={isEn}
          />
        </aside>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {isEn
          ? "Tips: double-click a text to edit it · drag, paste or drop images onto the ticket · Shift keeps proportions or rotates by 15° · Alt moves without guides · arrows nudge (Shift ×10)."
          : "Astuces : double-cliquez un texte pour l'écrire · glissez, collez ou déposez des images sur le billet · Maj garde les proportions ou pivote par 15° · Alt déplace sans repères · les flèches ajustent (Maj ×10)."}
      </p>
    </div>
  );
}
