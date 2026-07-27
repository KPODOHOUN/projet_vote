// Layout de segment (Server Component) : métadonnées pour la page Client.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: "Conditions générales d'utilisation de la plateforme de votes SHADOMA Votes."
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
