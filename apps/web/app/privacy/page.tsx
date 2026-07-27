"use client";

import { useI18n } from "../../lib/i18n-provider";

export default function PrivacyPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <main className="min-h-screen bg-background flex justify-center py-12 px-4 sm:px-6 lg:px-8">
      <article className="w-full max-w-3xl prose prose-slate dark:prose-invert">
        <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold">{isEn ? "Last update · April 29, 2026" : "Dernière mise à jour · 29 avril 2026"}</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground mt-2 mb-8">{isEn ? "Privacy policy." : "Politique de confidentialité."}</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Collected data" : "Données collectées"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "SHADOMA Votes only collects data required to run your events, secure paid votes, and monitor operations: organizer accounts, audit logs, payment transactions, and technical metrics."
              : "SHADOMA Votes collecte uniquement les données nécessaires au pilotage de vos évènements, à la sécurisation des votes payants et au suivi d'exploitation : comptes organisateurs, journaux d'audit, transactions de paiement et métriques techniques."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Processing purposes" : "Finalités de traitement"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Processing covers authentication, event management, payment confirmation, fraud detection, legal compliance, and service continuity."
              : "Les traitements couvrent l'authentification, la gestion des évènements, la confirmation des paiements, la détection de fraude, la conformité légale et la continuité de service."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Retention periods" : "Durées de conservation"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Operational data is kept according to the active retention policy. Payment records are retained to meet applicable legal obligations."
              : "Les données opérationnelles sont conservées selon la politique de rétention active de la plateforme. Les enregistrements de paiement sont conservés pour répondre aux obligations légales applicables."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "User rights" : "Droits des personnes"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Each user can request access, correction, export, or deletion of personal data. Requests are processed through official support and tracked in audit logs."
              : "Chaque utilisateur peut demander l'accès, la rectification, l'export ou la suppression de ses données. Les demandes sont traitées via le support officiel et tracées dans les journaux d'audit."}
          </p>
        </section>
      </article>
    </main>
  );
}
