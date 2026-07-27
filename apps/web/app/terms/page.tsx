"use client";

import { useI18n } from "../../lib/i18n-provider";

export default function TermsPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <main className="min-h-screen bg-background flex justify-center py-12 px-4 sm:px-6 lg:px-8">
      <article className="w-full max-w-3xl prose prose-slate dark:prose-invert">
        <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold">{isEn ? "Last update · April 29, 2026" : "Dernière mise à jour · 29 avril 2026"}</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground mt-2 mb-8">{isEn ? "Terms of use." : "Conditions générales d'utilisation."}</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Purpose" : "Objet"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "SHADOMA Votes provides a SaaS service for events, candidates, and paid votes management. Using the service implies full acceptance of these terms."
              : "SHADOMA Votes fournit un service SaaS permettant la gestion d'évènements, de candidats et de votes payants. L'utilisation du service implique l'acceptation pleine des présentes conditions."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Responsibilities" : "Responsabilités"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "The organizer remains responsible for event content, campaign legality, and local law compliance. SHADOMA Votes ensures reasonable availability and operational security."
              : "L'organisateur reste responsable du contenu de ses évènements, de la légalité des campagnes et du respect des règles locales. SHADOMA Votes assure la disponibilité raisonnable et la sécurité opérationnelle du service."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Payments" : "Paiements"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Payments are processed through certified Mobile Money partners. Each transaction is logged and verified before your event is updated."
              : "Les paiements passent par des partenaires Mobile Money certifiés. Chaque transaction est enregistrée et vérifiée avant la mise à jour de votre évènement."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Suspension and termination" : "Suspension et résiliation"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "SHADOMA Votes may suspend an account in case of fraud, legal non-compliance, or security threats against the platform."
              : "SHADOMA Votes peut suspendre un compte en cas d'usage frauduleux, de non-respect des obligations légales ou d'atteinte à la sécurité de la plateforme."}
          </p>
        </section>
      </article>
    </main>
  );
}
