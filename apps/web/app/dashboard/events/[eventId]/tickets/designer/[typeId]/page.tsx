"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { Button, LoadingState, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui";
import { DashboardBreadcrumb } from "@/components/dashboard-breadcrumb";
import { showToast } from "@/lib/toast";
import {
  ArrowLeft, Bold, Check, ChevronDown, ChevronUp,
  Copy, Eye, EyeOff, Image, Italic, Layers, Palette,
  Plus, Save, Text, Trash2, Type, Underline,
  AlignLeft, AlignCenter, AlignRight, Move,
  Upload, Crop, X
} from "lucide-react";

type DesignLayer = {
  id: string;
  type: "text" | "image";
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  rotation?: number;
    style: { fontSize?: number; fontWeight?: string; color?: string; textAlign?: "left" | "center" | "right"; fontStyle?: string; textDecoration?: string; objectFit?: "contain" | "cover" | "fill"; opacity?: number; borderRadius?: number; };
};

type TicketDesign = {
  width: number;
  height: number;
  background: { type: "color" | "gradient"; value: string };
  backgroundImage: string | null;
  layers: DesignLayer[];
};

let idCounter = 0;
function genId() { return `layer-${++idCounter}-${Date.now()}`; }

function defaultDesign(): TicketDesign {
  return {
    width: 600,
    height: 300,
    background: { type: "color", value: "#0a0c10" },
    backgroundImage: null,
    layers: [
      {
        id: genId(), type: "text", content: "EVENT NAME",
        x: 40, y: 30, width: 400, height: 50, zIndex: 1, visible: true,
        style: { fontSize: 32, fontWeight: "900", color: "#ffffff", textAlign: "left" }
      },
      {
        id: genId(), type: "text", content: "VIP Pass",
        x: 40, y: 90, width: 300, height: 36, zIndex: 2, visible: true,
        style: { fontSize: 22, fontWeight: "700", color: "#fbbf24", textAlign: "left" }
      },
      {
        id: genId(), type: "text", content: "Samedi 19 Juillet 2026",
        x: 40, y: 240, width: 300, height: 24, zIndex: 3, visible: true,
        style: { fontSize: 14, fontWeight: "400", color: "#94a3b8", textAlign: "left" }
      },
      {
        id: genId(), type: "text", content: "15 000 XOF",
        x: 460, y: 240, width: 120, height: 24, zIndex: 4, visible: true,
        style: { fontSize: 16, fontWeight: "800", color: "#ffffff", textAlign: "right" }
      }
    ]
  };
}

type TicketTypeInfo = {
  id: string; name: string; event: { title: string };
};

export default function TicketDesignerPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string; typeId: string }>();
  const { eventId, typeId } = params;
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [ticketType, setTicketType] = useState<TicketTypeInfo | null>(null);
  const [design, setDesign] = useState<TicketDesign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [addingText, setAddingText] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showCropModal, setShowCropModal] = useState<"background" | "logo" | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropDrag, setCropDrag] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [previewGenerated, setPreviewGenerated] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileBgRef = useRef<HTMLInputElement>(null);
  const fileLogoRef = useRef<HTMLInputElement>(null);

  const selectedLayer = design?.layers.find((l) => l.id === selectedLayerId) ?? null;

  useEffect(() => {
    async function load() {
      try {
        const token = getStoredToken();
        if (!token) { router.push("/login"); return; }
        const [typeData, designData] = await Promise.all([
          apiFetch<TicketTypeInfo>(`/events/${eventId}/ticket-types/${typeId}`, { headers: { Authorization: `Bearer ${token}` } }),
          apiFetch<TicketDesign>(`/events/${eventId}/ticket-types/${typeId}/design`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setTicketType(typeData);
        setDesign(designData);
      } catch {
        showToast.error(isEn ? "Failed to load ticket design" : "Échec du chargement");
        router.push(`/dashboard/events/${eventId}/tickets`);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [eventId, typeId]);

  const addLayer = useCallback((layer: DesignLayer) => {
    setDesign((d) => d ? { ...d, layers: [...d.layers, layer] } : d);
    setSelectedLayerId(layer.id);
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<DesignLayer>) => {
    setDesign((d) => d ? {
      ...d,
      layers: d.layers.map((l) => l.id === id ? { ...l, ...patch } : l)
    } : d);
  }, []);

  const removeLayer = useCallback((id: string) => {
    setDesign((d) => d ? { ...d, layers: d.layers.filter((l) => l.id !== id) } : d);
    setSelectedLayerId((prev) => prev === id ? null : prev);
  }, []);

  function addTextLayer() {
    const idx = design!.layers.length + 1;
    const layer: DesignLayer = {
      id: genId(), type: "text", content: "Texte",
      x: 40, y: 170, width: 300, height: 36, zIndex: idx, visible: true,
      style: { fontSize: 18, fontWeight: "700", color: "#ffffff", textAlign: "left" }
    };
    addLayer(layer);
  }

  function moveLayer(id: string, dir: "up" | "down") {
    setDesign((d) => {
      if (!d) return d;
      const layers = [...d.layers];
      const idx = layers.findIndex((l) => l.id === id);
      if (idx === -1) return d;
      const newIdx = dir === "up" ? Math.min(idx + 1, layers.length - 1) : Math.max(idx - 1, 0);
      if (newIdx === idx) return d;
      const tmp = layers[idx]!; layers[idx] = layers[newIdx]!; layers[newIdx] = tmp;
      const reindexed = layers.map((l, i) => ({ ...l, zIndex: i + 1 }));
      return { ...d, layers: reindexed };
    });
  }

  function duplicateLayer(id: string) {
    const layer = design?.layers.find((l) => l.id === id);
    if (!layer) return;
    addLayer({ ...layer, id: genId(), x: layer.x + 10, y: layer.y + 10, zIndex: design!.layers.length + 1 } as DesignLayer);
  }

  function onCanvasMouseDown(e: React.MouseEvent, layerId: string) {
    e.stopPropagation();
    const layer = design?.layers.find((l) => l.id === layerId);
    if (!layer) return;
    setDragging({ id: layerId, startX: e.clientX, startY: e.clientY, origX: layer.x, origY: layer.y });
    setSelectedLayerId(layerId);
  }

  function onCanvasMouseMove(e: React.MouseEvent) {
    if (!dragging || !design) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = design.width / rect.width;
    const scaleY = design.height / rect.height;
    const dx = (e.clientX - dragging.startX) * scaleX;
    const dy = (e.clientY - dragging.startY) * scaleY;
    const newX = Math.max(0, Math.min(design.width - 50, dragging.origX + dx));
    const newY = Math.max(0, Math.min(design.height - 20, dragging.origY + dy));
    updateLayer(dragging.id, { x: Math.round(newX), y: Math.round(newY) });
  }

  function onCanvasMouseUp() {
    setDragging(null);
  }

  function onCanvasClick() {
    setSelectedLayerId(null);
  }

  async function handleBgFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    const url = URL.createObjectURL(file);
    setCropImageUrl(url);
    setCropOffset({ x: 0, y: 0 });
    setShowCropModal("background");
    e.target.value = "";
  }

  async function handleLogoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    const url = URL.createObjectURL(file);
    setCropImageUrl(url);
    setCropOffset({ x: 0, y: 0 });
    setShowCropModal("logo");
    e.target.value = "";
  }

  async function applyCrop() {
    if (!cropFile || !showCropModal || !design) return;
    const canvas = document.createElement("canvas");
    const img = document.createElement("img");
    const url = URL.createObjectURL(cropFile);
    img.src = url;
    await new Promise((r) => { img.onload = r; });

    const ticketRatio = design.width / design.height;
    const imgRatio = img.width / img.height;
    let cropW: number, cropH: number;
    if (imgRatio > ticketRatio) {
      cropH = img.height;
      cropW = cropH * ticketRatio;
    } else {
      cropW = img.width;
      cropH = cropW / ticketRatio;
    }
    const maxOffsetX = img.width - cropW;
    const maxOffsetY = img.height - cropH;
    const ox = Math.max(0, Math.min(maxOffsetX, -cropOffset.x));
    const oy = Math.max(0, Math.min(maxOffsetY, -cropOffset.y));

    const targetW = showCropModal === "background" ? 1200 : 300;
    const targetH = showCropModal === "background" ? Math.round(targetW / ticketRatio) : 300;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, ox, oy, cropW, cropH, 0, 0, targetW, targetH);

      canvas.toBlob(async (blob) => {
      if (!blob) return;
      const formData = new FormData();
      formData.append("file", blob, cropFile.name);
      try {
        const token = getStoredToken();
        if (!token) return;
        if (showCropModal === "background") {
          setUploadingBg(true);
        } else {
          setUploadingLogo(true);
        }
        const res = await fetch(`${window.location.origin}/api/v1/uploads/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
          credentials: "include"
        });
        if (!res.ok) throw new Error("Upload failed");
        const result = await res.json() as { url: string };
        if (showCropModal === "background") {
          setDesign((d) => d ? { ...d, backgroundImage: result.url } : d);
        } else {
          const layer: DesignLayer = {
            id: genId(), type: "image", content: result.url,
            x: 460, y: 15, width: 100, height: 100, zIndex: design!.layers.length + 1, visible: true,
            style: { objectFit: "contain", opacity: 1, borderRadius: 8 }
          };
          addLayer(layer);
        }
        showToast.success(isEn ? "Image uploaded" : "Image téléchargée");
      } catch {
        showToast.error(isEn ? "Upload failed" : "Échec du téléchargement");
      } finally {
        setUploadingBg(false);
        setUploadingLogo(false);
        setShowCropModal(null);
        setCropFile(null);
        setCropImageUrl(null);
        URL.revokeObjectURL(url);
      }
    }, "image/webp", 0.9);
  }

  function onCropImageMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setCropDrag({ startX: e.clientX, startY: e.clientY, origX: cropOffset.x, origY: cropOffset.y });
  }

  function onCropImageMouseMove(e: React.MouseEvent) {
    if (!cropDrag) return;
    const dx = e.clientX - cropDrag.startX;
    const dy = e.clientY - cropDrag.startY;
    setCropOffset({ x: cropDrag.origX + dx, y: cropDrag.origY + dy });
  }

  function onCropImageMouseUp() {
    setCropDrag(null);
  }

  async function saveDesign() {
    if (!design) return;
    setIsSaving(true);
    try {
      const token = getStoredToken();
      if (!token) return;
      await apiFetch(`/events/${eventId}/ticket-types/${typeId}/design`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(design)
      });
      showToast.success(isEn ? "Design saved" : "Design enregistré");
    } catch {
      showToast.error(isEn ? "Failed to save" : "Échec de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <LoadingState variant="rows" count={3} label={isEn ? "Loading designer..." : "Chargement du designer..."} />;
  if (!design || !ticketType) return null;

  const sortedLayers = [...design.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/events/${eventId}/tickets`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <DashboardBreadcrumb items={[
            { label: isEn ? "Events" : "Évènements", href: "/dashboard/events" },
            { label: isEn ? "Tickets" : "Billets", href: `/dashboard/events/${eventId}/tickets` },
            { label: isEn ? "Design" : "Design", href: "#" }
          ]} />
          <span className="text-sm font-bold text-muted-foreground">· {ticketType.name}</span>
        </div>
        <Button onClick={saveDesign} disabled={isSaving}>
          <Save className="w-4 h-4 mr-1" />
          {isSaving ? (isEn ? "Saving..." : "Enregistrement...") : (isEn ? "Save" : "Enregistrer")}
        </Button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left panel - Layers */}
        <div className="w-64 flex-shrink-0 bg-card border border-border/60 rounded-2xl p-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3 h-3" /> {isEn ? "Layers" : "Calques"}
          </p>

          <div className="flex gap-1 flex-wrap">
            <button onClick={addTextLayer} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-xs font-semibold transition-colors">
              <Type className="w-3.5 h-3.5" /> {isEn ? "Text" : "Texte"}
            </button>
            <button onClick={() => fileBgRef.current?.click()} disabled={uploadingBg} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-xs font-semibold transition-colors">
              <Image className="w-3.5 h-3.5" /> {isEn ? "Background" : "Fond"}
            </button>
            <button onClick={() => fileLogoRef.current?.click()} disabled={uploadingLogo} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-xs font-semibold transition-colors">
              <Upload className="w-3.5 h-3.5" /> {isEn ? "Logo" : "Logo"}
            </button>
          </div>
          <input ref={fileBgRef} type="file" accept="image/*" className="hidden" onChange={handleBgFileSelected} />
          <input ref={fileLogoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileSelected} />

          {uploadingBg && <p className="text-xs text-muted-foreground">{isEn ? "Uploading background..." : "Téléchargement du fond..."}</p>}
          {uploadingLogo && <p className="text-xs text-muted-foreground">{isEn ? "Uploading logo..." : "Téléchargement du logo..."}</p>}

          <div className="flex flex-col gap-1">
            {sortedLayers.map((layer, idx) => (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  selectedLayerId === layer.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <span className="w-5 h-5 flex items-center justify-center rounded bg-muted flex-shrink-0">
                  {layer.type === "text" ? <Type className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                </span>
                <span className="truncate flex-1">{layer.type === "text" ? (layer.content || "text") : layer.content.split("/").pop()?.slice(0, 20) ?? "image"}</span>
                <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }} className="opacity-50 hover:opacity-100">
                  {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, "down"); }} disabled={idx === 0} className="opacity-30 hover:opacity-70 disabled:opacity-10">
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, "up"); }} disabled={idx === sortedLayers.length - 1} className="opacity-30 hover:opacity-70 disabled:opacity-10">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); duplicateLayer(layer.id); }} className="opacity-30 hover:opacity-70">
                  <Copy className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }} className="opacity-30 hover:opacity-70 text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          {design.layers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">{isEn ? "No layers. Add text or a logo." : "Aucun calque. Ajoutez du texte ou un logo."}</p>
          )}
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex items-center justify-center min-w-0" onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp}>
          <div className="bg-muted/30 rounded-2xl p-6 w-full h-full flex items-center justify-center overflow-hidden">
            <div
              ref={canvasRef}
              className="relative shadow-2xl rounded-xl overflow-hidden"
              style={{
                width: "100%",
                maxWidth: "600px",
                aspectRatio: `${design.width} / ${design.height}`,
                background: design.backgroundImage
                  ? `url(${design.backgroundImage}) center/cover no-repeat`
                  : design.background.type === "gradient"
                    ? design.background.value
                    : design.background.value,
                cursor: dragging ? "grabbing" : "default"
              }}
              onClick={onCanvasClick}
            >
              {sortedLayers
                .filter((l) => l.visible)
                .map((layer) => (
                  <div
                    key={layer.id}
                    onMouseDown={(e) => onCanvasMouseDown(e, layer.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute cursor-grab active:cursor-grabbing"
                    style={{
                      left: `${(layer.x / design.width) * 100}%`,
                      top: `${(layer.y / design.height) * 100}%`,
                      width: `${(layer.width / design.width) * 100}%`,
                      height: `${(layer.height / design.height) * 100}%`,
                      zIndex: layer.zIndex,
                      outline: selectedLayerId === layer.id ? "2px solid #6366f1" : "none",
                      outlineOffset: "1px",
                      borderRadius: "4px",
                      transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
                      opacity: layer.style.opacity ?? 1
                    }}
                  >
                    {layer.type === "text" ? (
                      <span
                        className="block w-full h-full truncate select-none"
                        style={{
                          fontSize: layer.style.fontSize ? `${layer.style.fontSize}px` : undefined,
                          fontWeight: layer.style.fontWeight,
                          color: layer.style.color,
                          textAlign: layer.style.textAlign ?? "left",
                          fontStyle: layer.style.fontStyle,
                          textDecoration: layer.style.textDecoration,
                          lineHeight: 1.2
                        }}
                      >
                        {layer.content}
                      </span>
                    ) : (
                      <img
                        src={layer.content}
                        alt=""
                        className="w-full h-full pointer-events-none"
                        style={{
                          objectFit: layer.style.objectFit ?? "contain",
                          borderRadius: layer.style.borderRadius ? `${layer.style.borderRadius}px` : undefined
                        }}
                      />
                    )}
                    {selectedLayerId === layer.id && (
                      <>
                        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white" />
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white" />
                        <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white" />
                        <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-white" />
                      </>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Right panel - Properties */}
        <div className="w-72 flex-shrink-0 bg-card border border-border/60 rounded-2xl p-4 flex flex-col gap-4 overflow-y-auto">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Palette className="w-3 h-3" /> {isEn ? "Properties" : "Propriétés"}
          </p>

          {!selectedLayer ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{isEn ? "Select a layer to edit its properties" : "Sélectionnez un calque pour éditer ses propriétés"}</p>

              <div className="pt-4 border-t border-border/40 space-y-3">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Background" : "Arrière-plan"}</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={design.background.type === "color" ? design.background.value : "#0a0c10"}
                    onChange={(e) => setDesign({ ...design, background: { type: "color", value: e.target.value } })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border/50"
                  />
                  <select
                    value={design.background.value}
                    onChange={(e) => setDesign({ ...design, background: { type: "color", value: e.target.value } })}
                    className="flex-1 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold"
                  >
                    <option value="#0a0c10">{isEn ? "Dark" : "Sombre"}</option>
                    <option value="#ffffff">{isEn ? "White" : "Blanc"}</option>
                    <option value="#1e3a5f">{isEn ? "Navy" : "Bleu marine"}</option>
                    <option value="#065f46">{isEn ? "Green" : "Vert"}</option>
                    <option value="#7c3aed">{isEn ? "Purple" : "Violet"}</option>
                    <option value="#991b1b">{isEn ? "Red" : "Rouge"}</option>
                    <option value="#1f2937">{isEn ? "Gray" : "Gris"}</option>
                  </select>
                  {design.backgroundImage && (
                    <button onClick={() => setDesign({ ...design, backgroundImage: null })} className="text-xs text-destructive font-bold whitespace-nowrap">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {selectedLayer.type === "text" ? "Texte" : "Image"}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => moveLayer(selectedLayer.id, "down")} className="p-1 hover:bg-muted rounded"><ChevronDown className="w-3 h-3" /></button>
                  <button onClick={() => moveLayer(selectedLayer.id, "up")} className="p-1 hover:bg-muted rounded"><ChevronUp className="w-3 h-3" /></button>
                  <button onClick={() => duplicateLayer(selectedLayer.id)} className="p-1 hover:bg-muted rounded"><Copy className="w-3 h-3" /></button>
                  <button onClick={() => removeLayer(selectedLayer.id)} className="p-1 hover:bg-muted rounded text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>

              {/* Position */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground">X</label>
                  <input type="number" value={selectedLayer.x} onChange={(e) => updateLayer(selectedLayer.id, { x: Number(e.target.value) })} className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground">Y</label>
                  <input type="number" value={selectedLayer.y} onChange={(e) => updateLayer(selectedLayer.id, { y: Number(e.target.value) })} className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold" />
                </div>
              </div>

              {/* Size */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground">W</label>
                  <input type="number" value={selectedLayer.width} onChange={(e) => updateLayer(selectedLayer.id, { width: Number(e.target.value) })} className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground">H</label>
                  <input type="number" value={selectedLayer.height} onChange={(e) => updateLayer(selectedLayer.id, { height: Number(e.target.value) })} className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold" />
                </div>
              </div>

              {selectedLayer.type === "text" && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">{isEn ? "Content" : "Contenu"}</label>
                    <input
                      type="text" value={selectedLayer.content}
                      onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })}
                      className="w-full h-9 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">{isEn ? "Font Size" : "Taille police"}</label>
                    <input
                      type="number" min={8} max={120}
                      value={selectedLayer.style.fontSize ?? 18}
                      onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontSize: Number(e.target.value) } })}
                      className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontWeight: selectedLayer.style.fontWeight === "900" ? "400" : "900" } })}
                      className={`p-2 rounded-lg text-xs ${selectedLayer.style.fontWeight === "900" ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const s = { ...selectedLayer.style };
                        if (s.fontStyle === "italic") delete s.fontStyle; else s.fontStyle = "italic";
                        updateLayer(selectedLayer.id, { style: s });
                      }}
                      className={`p-2 rounded-lg text-xs ${selectedLayer.style.fontStyle === "italic" ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const s = { ...selectedLayer.style };
                        if (s.textDecoration === "underline") delete s.textDecoration; else s.textDecoration = "underline";
                        updateLayer(selectedLayer.id, { style: s });
                      }}
                      className={`p-2 rounded-lg text-xs ${selectedLayer.style.textDecoration === "underline" ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, textAlign: align } })}
                        className={`flex-1 p-2 rounded-lg text-xs flex items-center justify-center gap-1 ${
                          (selectedLayer.style.textAlign ?? "left") === align ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        {align === "left" ? <AlignLeft className="w-3 h-3" /> : align === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">{isEn ? "Color" : "Couleur"}</label>
                    <input
                      type="color"
                      value={selectedLayer.style.color ?? "#ffffff"}
                      onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, color: e.target.value } })}
                      className="w-full h-9 rounded-lg cursor-pointer border border-border/50"
                    />
                  </div>
                </>
              )}

              {selectedLayer.type === "image" && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">{isEn ? "Opacity" : "Opacité"}</label>
                    <input
                      type="range" min={0} max={100}
                      value={Math.round((selectedLayer.style.opacity ?? 1) * 100)}
                      onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, opacity: Number(e.target.value) / 100 } })}
                      className="w-full"
                    />
                    <span className="text-[10px] text-muted-foreground">{Math.round((selectedLayer.style.opacity ?? 1) * 100)}%</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">{isEn ? "Border radius" : "Rayon de bord"}</label>
                    <input
                      type="number" min={0} max={100}
                      value={selectedLayer.style.borderRadius ?? 0}
                      onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, borderRadius: Number(e.target.value) } })}
                      className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">{isEn ? "Rotation" : "Rotation"}°</label>
                <input
                  type="number" min={-180} max={180}
                  value={selectedLayer.rotation ?? 0}
                  onChange={(e) => updateLayer(selectedLayer.id, { rotation: Number(e.target.value) })}
                  className="w-full h-8 rounded-lg border border-border/50 bg-background px-2 text-xs font-semibold"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Crop Modal */}
      <Dialog open={showCropModal !== null} onOpenChange={(open) => { if (!open) { setShowCropModal(null); setCropFile(null); setCropImageUrl(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEn ? "Crop image" : "Rogner l'image"}</DialogTitle>
          </DialogHeader>
          {cropImageUrl && (
            <div
              onMouseMove={onCropImageMouseMove}
              onMouseUp={onCropImageMouseUp}
              onMouseLeave={onCropImageMouseUp}
            >
              <p className="text-xs text-muted-foreground mb-4">
                {isEn ? "Drag the image to position it within the crop area." : "Déplacez l'image pour la positionner dans la zone de rognage."}
              </p>
              <div className="relative bg-muted rounded-xl overflow-hidden" style={{ aspectRatio: `${design.width} / ${design.height}`, maxHeight: "400px" }}>
                <img
                  src={cropImageUrl}
                  alt="crop preview"
                  draggable={false}
                  onMouseDown={onCropImageMouseDown}
                  className="absolute cursor-grab active:cursor-grabbing"
                  style={{
                    minWidth: "100%",
                    minHeight: "100%",
                    objectFit: "cover",
                    transform: `translate(${cropOffset.x}px, ${cropOffset.y}px)`,
                    transition: cropDrag ? "none" : "transform 0.1s"
                  }}
                />
                <div className="absolute inset-0 border-4 border-indigo-500/60 pointer-events-none rounded-xl" />
                <div className="absolute top-3 left-3 bg-indigo-500/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                  {design.width} × {design.height}
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="secondary" onClick={() => { setShowCropModal(null); setCropFile(null); setCropImageUrl(null); }}>
                  {isEn ? "Cancel" : "Annuler"}
                </Button>
                <Button onClick={applyCrop}>
                  <Crop className="w-4 h-4 mr-1" />
                  {isEn ? "Apply" : "Appliquer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
