// Layout de segment (Server Component) : métadonnées pour la page Client.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique relative aux cookies",
  description: "Usage des cookies et gestion de votre consentement sur SHADOMA Votes."
};

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
