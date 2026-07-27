// Layout de segment (Server Component) : métadonnées pour la page Client.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Comment SHADOMA Votes collecte, protège et traite vos données personnelles."
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
