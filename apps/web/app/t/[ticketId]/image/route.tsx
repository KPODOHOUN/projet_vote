import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { edgeProxyHeaders, visitorIp } from "@/lib/edge-proxy";
import {
  defaultTicketDesign,
  fillTicketText,
  isBlankDesign,
  layersToRender,
  renderableImageUrl,
  TICKET_FONTS,
  ticketFont,
  type DesignLayer,
  type TicketDesign
} from "@/lib/ticket-design";

// Billet livré à l'acheteur, rendu avec le design de l'organisateur : même image
// pour la page du billet, le téléchargement et l'e-mail.
export const runtime = "nodejs";

type PublicTicket = {
  id: string;
  number: number | null;
  status: string;
  holderName: string | null;
  amountCfa: number;
  ticketType: { name: string; design: TicketDesign | null };
  event: { title: string; startsAt: string | null };
};

const PAID_STATUSES = new Set(["PAID", "CONFIRMED", "USED"]);
const ALIGN = { left: "flex-start", center: "center", right: "flex-end" } as const;

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
/** Les polices de l'éditeur, en graisses 400 et 700 (assets/fonts). */
function loadFonts() {
  fontsPromise ??= Promise.all(
    TICKET_FONTS.flatMap((font) =>
      ([[400, "Regular"], [700, "Bold"]] as const).map(async ([weight, suffix]) => ({
        name: font.id,
        data: await readFile(join(process.cwd(), "assets", "fonts", `${font.file}-${suffix}.ttf`)),
        weight,
        style: "normal" as const
      }))
    )
  );
  return fontsPromise;
}

/** Couleur ou dégradé d'un fond de forme. */
function paint(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return value.startsWith("linear-gradient") ? { backgroundImage: value } : { backgroundColor: value };
}

/**
 * Image chargée par la route elle-même (avec l'IP du visiteur relayée), puis
 * passée au moteur en data: — il ne va rien chercher seul, et une image
 * manquante se voit ici au lieu de laisser un cadre vide sur le billet.
 */
async function inlineImage(url: string, relay: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store", headers: relay });
    const type = response.headers.get("content-type") ?? "";
    // Le moteur d'image ne lit que PNG, JPEG et GIF : un WebP ferait échouer tout le billet.
    if (!response.ok || !/^image\/(png|jpeg|gif)$/.test(type.split(";")[0]!.trim())) return null;
    return `data:${type.split(";")[0]};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const secret = new URL(request.url).searchParams.get("s") ?? "";
  const apiBase = getApiBaseUrl();
  const apiOrigin = new URL(apiBase, "http://localhost").origin;

  const relay = edgeProxyHeaders(visitorIp(request.headers));
  const response = await fetch(`${apiBase}/public/tickets/${encodeURIComponent(ticketId)}?s=${encodeURIComponent(secret)}`, {
    cache: "no-store",
    headers: relay
  }).catch(() => null);
  // API injoignable ≠ billet inconnu : l'acheteur doit savoir qu'il peut réessayer.
  if (!response) return new Response("Service momentanément indisponible, réessayez.", { status: 503, headers: { "Retry-After": "10" } });
  if (!response.ok) return new Response("Billet introuvable.", { status: 404 });
  const ticket = (await response.json()) as PublicTicket;
  // Un billet non payé n'a pas de billet à présenter (son QR serait refusé à l'entrée).
  if (!PAID_STATUSES.has(ticket.status)) return new Response("Ce billet n'est pas encore payé.", { status: 409 });

  const design = isBlankDesign(ticket.ticketType.design) ? defaultTicketDesign() : ticket.ticketType.design!;
  // Sortie nette à l'impression comme à l'écran : environ 1 600 px de large.
  const scale = Math.min(Math.max(1, 1600 / design.width), 2400 / design.width);
  const px = (value: number) => Math.round(value * scale);
  const layers = layersToRender(design);
  const imageUrls = [design.backgroundImage, ...layers.filter((l) => l.type === "image").map((l) => l.content)]
    .map((url) => renderableImageUrl(url, apiOrigin))
    .filter((url): url is string => url !== null);
  const [qr, ...images] = await Promise.all([
    inlineImage(`${apiBase}/public/tickets/${encodeURIComponent(ticket.id)}/qr?s=${encodeURIComponent(secret)}`, relay),
    ...imageUrls.map((url) => inlineImage(url, relay))
  ]);
  // Jamais de billet sans QR code : il ne permettrait pas d'entrer.
  if (!qr) return new Response("QR code indisponible, réessayez dans un instant.", { status: 503, headers: { "Retry-After": "10" } });
  const inlined = new Map(imageUrls.map((url, index) => [url, images[index] ?? null]));
  const inlineOf = (url: string | null) => {
    const resolved = renderableImageUrl(url, apiOrigin);
    return resolved ? inlined.get(resolved) ?? null : null;
  };
  const values = {
    ticketId: ticket.id,
    number: ticket.number,
    holderName: ticket.holderName,
    ticketTypeName: ticket.ticketType.name,
    eventTitle: ticket.event.title,
    eventStartsAt: ticket.event.startsAt,
    amountCfa: ticket.amountCfa
  };
  const background = inlineOf(design.backgroundImage);

  const renderLayer = (layer: DesignLayer) => {
    const box = {
      position: "absolute" as const,
      left: px(layer.x),
      top: px(layer.y),
      width: px(layer.width),
      height: px(layer.height),
      display: "flex",
      opacity: layer.style.opacity ?? 1,
      ...(layer.rotation ? { transform: `rotate(${layer.rotation}deg)` } : {})
    };
    if (layer.type === "qr") {
      const side = Math.min(px(layer.width), px(layer.height));
      const pad = Math.round(side * 0.05);
      return (
        <div key={layer.id} style={{ ...box, alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", background: "#ffffff", padding: pad, borderRadius: Math.round(side * 0.06) }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendu image serveur (next/og) */}
            <img src={qr} width={side - pad * 2} height={side - pad * 2} alt="" />
          </div>
        </div>
      );
    }
    if (layer.type === "shape") {
      const stroke = px(layer.style.strokeWidth ?? 0);
      if (layer.style.shape === "line") {
        return (
          <div key={layer.id} style={{ ...box, alignItems: "center" }}>
            <div style={{ display: "flex", width: "100%", height: Math.max(1, stroke || px(2)), backgroundColor: layer.style.stroke ?? "#ffffff" }} />
          </div>
        );
      }
      return (
        <div
          key={layer.id}
          style={{
            ...box,
            ...paint(layer.style.fill ?? "#ffffff"),
            ...(stroke ? { border: `${stroke}px solid ${layer.style.stroke ?? "#ffffff"}` } : {}),
            borderRadius: layer.style.shape === "ellipse" ? "50%" : px(layer.style.borderRadius ?? 0)
          }}
        />
      );
    }
    if (layer.type === "image") {
      const src = inlineOf(layer.content);
      if (!src) return null;
      return (
        <div key={layer.id} style={box}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendu image serveur (next/og) */}
          <img
            src={src}
            width={px(layer.width)}
            height={px(layer.height)}
            alt=""
            style={{ objectFit: layer.style.objectFit ?? "contain", borderRadius: px(layer.style.borderRadius ?? 0) }}
          />
        </div>
      );
    }
    const weight = Number.parseInt(layer.style.fontWeight ?? "400", 10) >= 600 ? 700 : 400;
    return (
      <div
        key={layer.id}
        style={{
          ...box,
          alignItems: "flex-start",
          justifyContent: ALIGN[layer.style.textAlign ?? "left"],
          textAlign: layer.style.textAlign ?? "left",
          fontFamily: ticketFont(layer.style.fontFamily).id,
          fontSize: px(layer.style.fontSize ?? 18),
          fontWeight: weight,
          color: layer.style.color ?? "#ffffff",
          lineHeight: layer.style.lineHeight ?? 1.2,
          letterSpacing: px(layer.style.letterSpacing ?? 0),
          whiteSpace: "pre-wrap",
          ...(layer.style.textDecoration === "underline" ? { textDecoration: "underline" } : {})
        }}
      >
        {fillTicketText(layer.content, values)}
      </div>
    );
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "inter",
          ...(design.background.type === "gradient"
            ? { backgroundImage: design.background.value }
            : { backgroundColor: design.background.value })
        }}
      >
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendu image serveur (next/og)
          <img src={background} width={px(design.width)} height={px(design.height)} alt="" style={{ position: "absolute", left: 0, top: 0, objectFit: "cover" }} />
        ) : null}
        {layers.map(renderLayer)}
      </div>
    ),
    {
      width: px(design.width),
      height: px(design.height),
      fonts: await loadFonts(),
      // Rendu coûteux (~1 s) : gardé une heure au bord du réseau, par URL. L'URL
      // porte le secret du billet, donc seul son détenteur peut l'atteindre.
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" }
    }
  );
}
