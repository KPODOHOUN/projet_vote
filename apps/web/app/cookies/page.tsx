"use client";

import { useI18n } from "../../lib/i18n-provider";

export default function CookiesPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <main className="min-h-screen bg-background flex justify-center py-12 px-4 sm:px-6 lg:px-8">
      <article className="w-full max-w-3xl prose prose-slate dark:prose-invert">
        <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold">{isEn ? "Last update · April 29, 2026" : "Dernière mise à jour · 29 avril 2026"}</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground mt-2 mb-8">{isEn ? "Cookie policy." : "Politique cookies."}</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Strictly necessary cookies" : "Cookies strictement nécessaires"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "SHADOMA Votes uses technical cookies to maintain authenticated sessions, secure requests, and ensure organizer journey availability."
              : "SHADOMA Votes utilise des cookies techniques pour maintenir les sessions authentifiées, sécuriser les requêtes et assurer la disponibilité des parcours organisateur."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Analytics and observability" : "Mesure d'audience et observabilité"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Observability tools are configured to limit personal data and trace technical incidents. No marketing cookie is enabled by default."
              : "Les outils d'observabilité sont configurés pour limiter les données personnelles et tracer les incidents techniques. Aucun cookie marketing n'est activé par défaut."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Preference management" : "Gestion des préférences"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Users can review preferences through account settings and support channels. Consent changes are logged."
              : "L'utilisateur peut demander la révision de ses préférences via les paramètres du compte et l'équipe support. Les évolutions de consentement sont journalisées."}
          </p>
        </section>
      </article>
    </main>
  );
}
