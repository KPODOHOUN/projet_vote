"use client";

import type { CSSProperties } from "react";
import { QrCode } from "lucide-react";
import { fillTicketText, ticketFont, type DesignLayer, type TicketValues } from "@/lib/ticket-design";

/** Couleur ou dégradé (même règle que le rendu du billet). */
export function paintStyle(value: string | undefined): CSSProperties {
  if (!value) return {};
  return value.startsWith("linear-gradient") ? { backgroundImage: value } : { backgroundColor: value };
}

/**
 * Contenu d'un calque, à l'échelle `scale` (pixels écran par unité du billet).
 * Reprend les règles de app/t/[ticketId]/image/route.tsx : ce que l'organisateur
 * voit est le billet que l'acheteur reçoit.
 */
export function LayerView({ layer, scale, preview }: { layer: DesignLayer; scale: number; preview: TicketValues | null }) {
  const style = layer.style;
  if (layer.type === "qr") {
    return (
      <span className="flex h-full w-full items-center justify-center bg-white text-slate-900" style={{ borderRadius: "6%" }}>
        <QrCode className="h-[88%] w-[88%]" strokeWidth={1.4} aria-label="QR code" />
      </span>
    );
  }
  if (layer.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- image importée par l'organisateur, cadrée librement sur le billet
      <img
        src={layer.content}
        alt=""
        draggable={false}
        className="pointer-events-none h-full w-full select-none"
        style={{ objectFit: style.objectFit ?? "contain", borderRadius: (style.borderRadius ?? 0) * scale }}
      />
    );
  }
  if (layer.type === "shape") {
    const stroke = (style.strokeWidth ?? 0) * scale;
    if (style.shape === "line") {
      return (
        <span className="flex h-full w-full items-center">
          <span className="block w-full" style={{ height: Math.max(1, stroke || 2 * scale), backgroundColor: style.stroke ?? "#ffffff" }} />
        </span>
      );
    }
    return (
      <span
        className="block h-full w-full"
        style={{
          ...paintStyle(style.fill ?? "#ffffff"),
          border: stroke ? `${stroke}px solid ${style.stroke ?? "#ffffff"}` : undefined,
          borderRadius: style.shape === "ellipse" ? "50%" : (style.borderRadius ?? 0) * scale
        }}
      />
    );
  }
  const text = preview ? fillTicketText(layer.content, preview) : layer.content;
  // Pas de rognage : le rendu du billet ne coupe pas non plus un texte qui déborde de son cadre.
  return (
    <span
      className="flex h-full w-full select-none"
      style={{
        justifyContent: style.textAlign === "center" ? "center" : style.textAlign === "right" ? "flex-end" : "flex-start",
        textAlign: style.textAlign ?? "left",
        fontFamily: `var(${ticketFont(style.fontFamily).cssVar}), sans-serif`,
        fontSize: (style.fontSize ?? 18) * scale,
        fontWeight: Number.parseInt(style.fontWeight ?? "400", 10) >= 600 ? 700 : 400,
        color: style.color ?? "#ffffff",
        lineHeight: style.lineHeight ?? 1.2,
        letterSpacing: (style.letterSpacing ?? 0) * scale,
        textDecoration: style.textDecoration === "underline" ? "underline" : undefined,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere"
      }}
    >
      {text}
    </span>
  );
}
