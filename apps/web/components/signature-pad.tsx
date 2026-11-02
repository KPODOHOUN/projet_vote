"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui";

type SignaturePadProps = {
  isEn: boolean;
  disabled?: boolean;
  /** PNG (data URL) de la signature, ou null quand le cadre est vide. */
  onChange: (pngDataUrl: string | null) => void;
};

/** Cadre de signature au doigt ou à la souris (événements pointeur), exporté en PNG. */
export function SignaturePad({ isEn, disabled = false, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    strokes.current += 1;
    setEmpty(false);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    strokes.current = 0;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={isEn ? "Signature area: draw your signature" : "Zone de signature : tracez votre signature"}
        className="h-40 w-full touch-none rounded-md border border-dashed border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{empty ? (isEn ? "Draw your signature in the box." : "Tracez votre signature dans le cadre.") : isEn ? "Signature drawn." : "Signature tracée."}</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || empty}>
          <Eraser className="mr-1 size-4" aria-hidden="true" />
          {isEn ? "Clear" : "Effacer"}
        </Button>
      </div>
    </div>
  );
}
