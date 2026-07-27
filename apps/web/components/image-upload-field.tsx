"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import { isFileUploadAvailable, uploadCandidatePhoto } from "../lib/upload";
import { cn } from "../lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/bmp,image/*";

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)$/i.test(file.name);
}

type ImageUploadFieldProps = {
  value: string;
  onChange: (url: string) => void;
  token: string;
  label: string;
  preview?: ReactNode;
  /** Affiche le champ URL en repli (défaut : true) */
  showUrlFallback?: boolean;
  urlPlaceholder?: string;
};

export function ImageUploadField({
  value,
  onChange,
  token,
  label,
  preview,
  showUrlFallback = true,
  urlPlaceholder
}: ImageUploadFieldProps) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const canUpload = isFileUploadAvailable();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!isImageFile(file)) {
      setError(isEn ? "Please choose an image file." : "Choisissez une image (JPG, PNG, etc.).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(isEn ? "Image must be 5 MB or smaller." : "L'image doit faire 5 Mo maximum.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadCandidatePhoto(file, token);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : isEn ? "Upload failed." : "Échec de l'envoi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (canUpload && !busy) setDragOver(true);
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (!canUpload || busy) return;
    void handleFile(event.dataTransfer.files?.[0]);
  }

  const pickLabel = isEn ? "Upload from your computer" : "Importer depuis mon ordinateur";
  const pickHint = isEn
    ? "Click to choose a photo or drag and drop"
    : "Cliquez pour choisir une photo ou glissez-déposez";
  const defaultUrlPlaceholder = canUpload
    ? (isEn ? "…or paste an image URL" : "…ou collez une URL d'image")
    : (isEn ? "Paste an image URL (e.g. https://…)" : "Collez l'URL d'une image (ex: https://…)");

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold text-foreground">{label}</span>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {preview ? <div className="shrink-0">{preview}</div> : null}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {canUpload ? (
            <>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                disabled={busy}
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <label
                htmlFor={inputId}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                  "hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/30",
                  dragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30",
                  busy && "pointer-events-none opacity-60"
                )}
              >
                {busy ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <span className="flex items-center gap-2 text-primary" aria-hidden="true">
                    <ImagePlus className="h-7 w-7 sm:hidden" />
                    <Camera className="hidden h-6 w-6 sm:block" />
                    <ImagePlus className="hidden h-6 w-6 sm:block" />
                  </span>
                )}
                <span className="text-sm font-semibold text-foreground">
                  {busy ? (isEn ? "Sending…" : "Envoi en cours…") : pickLabel}
                </span>
                <span className="max-w-xs text-xs text-muted-foreground">{pickHint}</span>
                <span className="text-xs text-muted-foreground">
                  {isEn ? "JPG, PNG, WebP · max 5 MB" : "JPG, PNG, WebP · 5 Mo max"}
                </span>
              </label>
            </>
          ) : null}

          {showUrlFallback ? (
            <input
              type="url"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={urlPlaceholder ?? defaultUrlPlaceholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
