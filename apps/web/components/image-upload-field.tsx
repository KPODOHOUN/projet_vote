"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import { isFileUploadAvailable, uploadCandidatePhoto } from "../lib/upload";
import { cn } from "../lib/utils";

// Avant réduction dans le navigateur (lib/image-resize) ; l'API reçoit au plus 5 Mo.
const MAX_BYTES = 25 * 1024 * 1024;
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
  /** Phrase d'aide sous le libellé (ex. recadrage appliqué sur la page publique). */
  hint?: string;
};

export function ImageUploadField({
  value,
  onChange,
  token,
  label,
  preview,
  hint
}: ImageUploadFieldProps) {
  // Photos importées uniquement (Cloudinary, ou stockées en base par l'API), jamais un lien saisi.
  const { locale, t } = useI18n();
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
      setError(isEn ? "Image must be 25 MB or smaller." : "L'image doit faire 25 Mo maximum.");
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
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {hint ? <span className="-mt-2 text-xs text-slate-600">{hint}</span> : null}

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

          {!canUpload ? (
            <p className="text-sm text-slate-600" role="status">
              {t("upload.unavailable")}
            </p>
          ) : null}

          {value && !busy ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("upload.remove")}
            </button>
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
