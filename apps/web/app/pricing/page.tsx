"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "../../lib/i18n-provider";
import { useAuthModal } from "../../components/auth/auth-modal-provider";
import { AmbientBackdrop } from "../../components/ambient-backdrop";
import { AppHeader } from "../../components/app-header";
import { Check } from "lucide-react";

export default function PricingPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const { openAuth } = useAuthModal();

  return (
    <AmbientBackdrop className="min-h-screen bg-background text-foreground" variant="rich">
      <AppHeader />
      <main className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 text-center text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {isEn ? "Escrow — platform collection" : "Escrow — encaissement plateforme"}
        </motion.h1>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          {isEn
            ? "During the test phase, only Escrow is available. Demo payments never debit real Mobile Money."
            : "Pendant la phase de test, seule l'offre Escrow est disponible. Les paiements démo ne débitent aucun Mobile Money réel."}
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <motion.article
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/40 bg-card/80 p-6 shadow-sm backdrop-blur ring-1 ring-primary/20"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
              {isEn ? "Available now" : "Disponible maintenant"}
            </p>
            <h2 className="mb-2 text-xl font-semibold">
              {isEn ? "Platform collection (Escrow)" : "Encaissement plateforme (Escrow)"}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {isEn
                ? "Funds stay on the platform until close or withdrawal. Retention % at the end."
                : "Les fonds restent chez la plateforme jusqu'à clôture ou retrait. Retenue % à la fin."}
            </p>
            <ul className="mb-8 space-y-2">
              {(
                isEn
                  ? [
                      "Unlimited events",
                      "Organizer wallet with ledger",
                      "Withdrawal after admin approval",
                      "Demo payments for the test phase"
                    ]
                  : [
                      "Événements illimités",
                      "Portefeuille organisateur avec journal",
                      "Retrait après validation admin",
                      "Paiements démo pour la phase de test"
                    ]
              ).map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => openAuth("register")}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              {isEn ? "Create an account" : "Créer un compte"}
            </button>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-muted/30 p-6 opacity-80"
            aria-disabled="true"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {isEn ? "Under review" : "En réflexion"}
            </p>
            <h2 className="mb-2 text-xl font-semibold">
              {isEn ? "External payment account" : "Compte de paiement externe"}
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {isEn
                ? "Not available during the Escrow test phase. Product decision pending."
                : "Indisponible pendant la phase de test Escrow. Décision produit en cours."}
            </p>
            <ul className="mb-8 space-y-2">
              {(
                isEn
                  ? [
                      "Native PSP split still under review",
                      "Not selectable at signup",
                      "Existing External tenants stay gated",
                      "Will reopen only after product approval"
                    ]
                  : [
                      "Split PSP natif encore en étude",
                      "Non sélectionnable à l'inscription",
                      "Comptes External existants restent bloqués",
                      "Réouverture uniquement après validation produit"
                    ]
              ).map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-muted-foreground"
            >
              {isEn ? "Coming later" : "Bientôt disponible"}
            </button>
          </motion.article>
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            {isEn ? "Back home" : "Retour à l'accueil"}
          </Link>
        </p>
      </main>
    </AmbientBackdrop>
  );
}
