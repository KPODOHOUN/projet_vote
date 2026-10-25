import type { MetadataRoute } from "next";

// Manifest minimal (G3) : nom SHADOMA, icône existante (app/icon.svg), aucune image générée.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SHADOMA",
    short_name: "SHADOMA",
    description: "Concours à votes payants en FCFA, paiement par Mobile Money.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]
  };
}
