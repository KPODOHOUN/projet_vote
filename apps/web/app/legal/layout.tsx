// Layout de segment (Server Component) : fournit des métadonnées propres à la
// page légale, qui est un Client Component et ne peut donc pas exporter `metadata`.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales et informations sur l'éditeur de la plateforme SHADOMA Votes."
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
