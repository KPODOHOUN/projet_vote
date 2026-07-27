"use client";

import { useI18n } from "../../lib/i18n-provider";

export default function LegalPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <main className="min-h-screen bg-background flex justify-center py-12 px-4 sm:px-6 lg:px-8">
      <article className="w-full max-w-3xl prose prose-slate dark:prose-invert">
        <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold">{isEn ? "Last update · April 29, 2026" : "Dernière mise à jour · 29 avril 2026"}</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground mt-2 mb-8">{isEn ? "Legal notice." : "Mentions légales."}</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Platform publisher" : "Éditeur de la plateforme"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "SHADOMA Votes is a paid-voting platform operated for professional and cultural event organizers in French-speaking Africa."
              : "SHADOMA Votes est une plateforme de vote payant opérée pour les organisateurs d'évènements professionnels et culturels en Afrique francophone."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Hosting" : "Hébergement"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Frontend is deployed on Cloudflare Pages, API on Google Cloud Run, database on Neon PostgreSQL, with managed services for cache, storage, and cron."
              : "Le frontend est déployé sur Cloudflare Pages, l'API sur Google Cloud Run, la base de données sur Neon PostgreSQL, avec services managés complémentaires pour cache, stockage et cron."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Compliance contact" : "Contact conformité"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "For legal, privacy, or data-right requests, use the official support channel of the operating organization."
              : "Pour toute demande relative aux obligations légales, à la confidentialité ou à l'exercice des droits, utiliser le canal support officiel de l'organisation exploitante."}
          </p>
        </section>
      </article>
    </main>
  );
}
