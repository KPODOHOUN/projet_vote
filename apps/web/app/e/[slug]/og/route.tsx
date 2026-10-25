import { ImageResponse } from "next/og";
import { buildEventTheme } from "../../../../lib/brand";
import { fetchPublicEvent } from "../../../../lib/public-event-fetch";

// Carte de partage typographique (7.11-g) : titre de l'événement sur l'accent
// lisible, texte blanc, SHADOMA en pied. Aucune illustration.
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchPublicEvent(slug);
  const title = data?.event.title ?? "SHADOMA";
  const theme = buildEventTheme(data?.event.branding.brandColor ?? null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: theme.accentStrong,
          color: "#ffffff"
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: "0.3em", textTransform: "uppercase" }}>Vote</div>
        <div style={{ display: "flex", fontSize: title.length > 40 ? 64 : 88, fontWeight: 300, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em" }}>SHADOMA</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600" }
    }
  );
}
