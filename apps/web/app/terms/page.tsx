"use client";

import { useI18n } from "../../lib/i18n-provider";

export default function TermsPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  return (
    <main className="min-h-screen bg-background flex justify-center py-12 px-4 sm:px-6 lg:px-8">
      <article className="w-full max-w-3xl prose prose-slate">
        <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold">{isEn ? "Last update · April 29, 2026" : "Dernière mise à jour · 29 avril 2026"}</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground mt-2 mb-8">{isEn ? "Terms of use." : "Conditions générales d'utilisation."}</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Purpose" : "Objet"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "SHADOMA Votes provides a SaaS service for events, candidates, and paid votes management. Using the service implies full acceptance of these terms."
              : "SHADOMA Votes fournit un service SaaS permettant la gestion d'événements, de candidats et de votes payants. L'utilisation du service implique l'acceptation pleine des présentes conditions."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Responsibilities" : "Responsabilités"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "The organizer remains responsible for event content, campaign legality, and local law compliance. SHADOMA Votes makes reasonable efforts to keep the service available, without guaranteeing uninterrupted access."
              : "L'organisateur reste responsable du contenu de ses événements, de la légalité des campagnes et du respect des règles locales. SHADOMA Votes fait des efforts raisonnables pour maintenir le service disponible, sans garantir un accès ininterrompu."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Payments" : "Paiements"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "Voters pay with Mobile Money through a payment provider. A vote counts only once the provider has confirmed the payment to SHADOMA Votes. Each transaction is recorded."
              : "Les votants paient par Mobile Money via un prestataire de paiement. Une voix ne compte qu'une fois le paiement confirmé à SHADOMA Votes par ce prestataire. Chaque transaction est enregistrée."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Confirmed votes" : "Votes confirmés"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "A confirmed vote is final. It is not credited back automatically, including when a contest is closed or cancelled. Any request about a payment goes to the contest organizer."
              : "Un vote confirmé est définitif. Il n'est pas recrédité automatiquement, y compris si le concours est clôturé ou annulé. Toute demande sur un paiement s'adresse à l'organisateur du concours."}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{isEn ? "Organizer funds and withdrawals" : "Fonds de l'organisateur et retraits"}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {isEn
              ? "The commission rate is written in the contract the organizer signs before the contest goes online and does not change afterwards. Withdrawals are requested by the organizer and processed by hand by SHADOMA after approval; there is no automatic transfer."
              : "Le taux de commission figure dans le contrat que l'organisateur signe avant la mise en ligne du concours et ne change plus ensuite. Les retraits sont demandés par l'organisateur et traités à la main par SHADOMA après validation ; il n'y a pas de virement automatique."}
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
