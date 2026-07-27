"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../lib/i18n-provider";
import { AmbientBackdrop } from "../components/ambient-backdrop";
import { GlassCard } from "../components/glass-card";
import { AppHeader } from "../components/app-header";
import { HowItWorks } from "../components/how-it-works";
import { PaymentProvidersShowcase } from "../components/payment-providers-showcase";
import { PartnerCarousel } from "../components/partner-carousel";
import { useAuthModal } from "../components/auth/auth-modal-provider";
import { HeroThreeScene } from "../components/hero-three-scene";
import Image from "next/image";

const HERO_BG_SLIDES = [
  "/slider/contest-night.png",
  "/slider/mobile-voters.png",
  "/slider/organizer-control.png",
  "/slider/contest-night.svg",
  "/slider/mobile-voters.svg",
];

const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconArrow = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 12h14m0 0l-5-5m5 5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const svgProps = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", "aria-hidden": true as const };

const IconPhone = () => (
  <svg {...svgProps}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IconPulse = () => (
  <svg {...svgProps}>
    <path d="M3 12h4l2.5-6 5 13 2.5-7H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconShield = () => (
  <svg {...svgProps}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBolt = () => (
  <svg {...svgProps}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 15 }
  }
};

export default function HomePage() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [bgIndex, setBgIndex] = useState(0);
  const reducedMotion = useRef(false);
  const { openAuth } = useAuthModal();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { reducedMotion.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion.current) return;
    const id = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % HERO_BG_SLIDES.length);
    }, 4800);
    return () => clearInterval(id);
  }, []);

  const trustItems = [
    { icon: <IconPhone />, label: isEn ? "Mobile Money" : "Mobile Money" },
    { icon: <IconPulse />, label: isEn ? "Live results" : "Résultats en direct" },
    { icon: <IconShield />, label: isEn ? "Secure & compliant" : "Sécurisé & conforme" },
    { icon: <IconBolt />, label: isEn ? "Launch in a day" : "Lancé en un jour" }
  ];

  const faq: [string, string][] = [
    [
      isEn ? "Can voters use their phones?" : "Peut-on voter depuis un téléphone ?",
      isEn ? "Yes — mobile-first, a few seconds." : "Oui — pensé mobile, quelques secondes."
    ],
    [
      isEn ? "How fast can we launch?" : "En combien de temps peut-on lancer ?",
      isEn ? "Most teams launch in under a day." : "La plupart lancent en moins d'un jour."
    ],
    [
      isEn ? "Which payment methods?" : "Quels moyens de paiement ?",
      isEn ? "FeexPay, KkiaPay, FedaPay — SebPay soon." : "FeexPay, KkiaPay, FedaPay — SebPay bientôt."
    ]
  ];

  return (
    <>
      <AmbientBackdrop variant="rich">
        <AppHeader />
        <main id="main-content" className="min-h-screen">
          {/* Hero */}
          <section id="hero" className="relative flex items-center justify-center overflow-hidden min-h-screen pt-24 pb-12 md:pt-28 md:pb-16">
            <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
              {HERO_BG_SLIDES.map((src, idx) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  fill
                  className="object-cover transition-opacity duration-[1.4s]"
                  style={{ opacity: idx === bgIndex ? 1 : 0 }}
                  priority={idx === 0}
                />
              ))}
              <div className="absolute inset-0 bg-black/50" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.7)_100%)]" />
              <div className="absolute inset-0 opacity-30 mix-blend-screen">
                <HeroThreeScene />
              </div>
            </div>

            <div className="container relative z-10 px-4 md:px-6">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="mx-auto max-w-4xl flex flex-col items-center text-center"
              >
                <motion.div
                  variants={itemVariants}
                  className="vp-pill-glass inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-primary/90 border-primary/20"
                >
                  <span className="mr-2 h-2.5 w-2.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                  <span>SHADOMA Votes</span>
                </motion.div>

                <motion.h1
                  variants={itemVariants}
                  className="mt-6 text-[clamp(2rem,6vw,4rem)] font-extrabold leading-[1.05] tracking-tight text-white"
                >
                  <span>{isEn ? "Simplifiez vos" : "Simplifiez vos"}</span>
                  <br />
                  <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
                    {isEn ? "paid votes" : "votes payants"}
                  </span>
                </motion.h1>

                <motion.p
                  variants={itemVariants}
                  className="mt-4 max-w-2xl text-lg leading-relaxed text-white/80"
                >
                  {isEn
                    ? "Run your contest, collect paid votes via Mobile Money, and follow results live."
                    : "Lancez votre concours, encaissez chaque vote via Mobile Money et suivez les résultats en direct."}
                </motion.p>

                <motion.div
                  variants={itemVariants}
                  className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row w-full sm:w-auto"
                >
                  <motion.button
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => openAuth("register")}
                    className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-violet-600 px-8 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:shadow-xl hover:shadow-brand-500/40"
                  >
                    {isEn ? "Create my account" : "Créer mon compte"}
                  </motion.button>

                  <motion.a
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    href="/e/miss-campus-2026"
                    className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-8 text-base font-semibold text-white transition-all hover:bg-white/20 group"
                  >
                    {isEn ? "See the demo" : "Voir la démo"}
                    <span className="ml-2 transition-transform group-hover:translate-x-1"><IconArrow /></span>
                  </motion.a>
                </motion.div>

                <motion.p variants={itemVariants} className="mt-4 text-xs font-semibold tracking-wider uppercase text-white/60">
                  {isEn ? "No card required · Free activation · Mobile-first" : "Sans carte bancaire · Activation gratuite · Pensé mobile"}
                </motion.p>
              </motion.div>

            </div>
          </section>

          {/* Trust bar */}
          <section aria-label={isEn ? "Key benefits" : "Points clés"} className="py-8">
            <div className="container px-4 md:px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
              >
                <GlassCard intensity="subtle" className="px-6 py-6 md:px-8 border border-border/30">
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
                    {trustItems.map((item, idx) => (
                      <motion.li
                        key={item.label}
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.4 }}
                        className="flex items-center gap-3"
                      >
                        <span className="flex-shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary ring-1 ring-primary/15" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="font-bold text-foreground text-sm tracking-tight">{item.label}</span>
                      </motion.li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            </div>
          </section>

          {/* How it works */}
          <section id="comment-ca-marche" className="py-20">
            <div className="container px-4 md:px-6">
              <header className="mx-auto mb-16 max-w-2xl text-center space-y-3">
                <span className="vp-pill-glass inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
                  {isEn ? "How it works" : "Comment ça marche"}
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                  {isEn ? "Four steps to your first vote" : "Quatre étapes vers votre premier vote"}
                </h2>
              </header>
              <HowItWorks isEn={isEn} />
            </div>
          </section>

          {/* Payment providers */}
          <section id="paiements" className="py-20">
            <div className="container px-4 md:px-6">
              <header className="mx-auto mb-10 max-w-2xl text-center space-y-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                  {isEn ? "Supported Payment Networks" : "Opérateurs de paiement supportés"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isEn ? "Multiple Mobile Money options for secure, seamless voting." : "Plusieurs options Mobile Money pour vos votants."}
                </p>
              </header>
              <div className="mx-auto max-w-5xl">
                <PaymentProvidersShowcase isEn={isEn} />
              </div>
            </div>
          </section>

          {/* Offers */}
          <section id="offres" className="py-20">
            <div className="container px-4 md:px-6">
              <header className="mx-auto mb-12 max-w-2xl text-center space-y-3">
                <span className="vp-pill-glass inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
                  {isEn ? "Offers" : "Offres"}
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                  {isEn ? "Choose your platform model" : "Choisissez votre modèle"}
                </h2>
              </header>

              <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2 lg:grid-cols-3">
                <motion.article
                  whileHover={{ y: -6, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="vp-glass flex h-full flex-col rounded-3xl p-8 border border-border/50 hover:border-primary/30 transition-all duration-300 bg-card/30"
                >
                  <p className="mb-1 text-2xl font-extrabold text-foreground">{isEn ? "Standard" : "Standard"}</p>
                  <p className="mb-6 text-sm text-muted-foreground">{isEn ? "For independent organizers" : "Pour organisateur autonome"}</p>
                  <ul className="mb-8 flex-1 space-y-4 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-primary shrink-0"><IconCheck /></span>
                      <span>{isEn ? "Fast launch, full self-service control" : "Lancement instantané, contrôle autonome"}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-primary shrink-0"><IconCheck /></span>
                      <span>{isEn ? "Live collections & financial dashboard" : "Suivi en temps réel des encaissements"}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-primary shrink-0"><IconCheck /></span>
                      <span>{isEn ? "Localized bilingual FR / EN voter flow" : "Parcours votant bilingue FR / EN fluide"}</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => openAuth("register")}
                    className="vp-btn-glow mt-auto inline-flex h-12 w-full items-center justify-center rounded-full border border-border hover:border-primary bg-background/50 hover:bg-background px-8 text-base font-bold text-foreground transition-all"
                  >
                    {isEn ? "Start with Standard" : "Démarrer avec Standard"}
                  </button>
                </motion.article>

                <motion.article
                  whileHover={{ y: -6, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="vp-glass flex h-full flex-col rounded-3xl border border-border/50 bg-card/30 p-8 transition-all duration-300 hover:border-primary/30"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8 9h8M8 13h5M8 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="mb-1 text-2xl font-extrabold text-foreground">{isEn ? "Ticketing" : "Billetterie"}</p>
                  <p className="mb-6 text-sm text-muted-foreground">{isEn ? "Sell and validate event tickets" : "Vendez et validez les billets de vos événements"}</p>
                  <ul className="mb-8 flex-1 space-y-4 text-sm">
                    <li className="flex items-start gap-3"><span className="mt-0.5 shrink-0 text-primary"><IconCheck /></span><span>{isEn ? "Custom ticket types and prices" : "Types de billets et tarifs personnalisés"}</span></li>
                    <li className="flex items-start gap-3"><span className="mt-0.5 shrink-0 text-primary"><IconCheck /></span><span>{isEn ? "Secure online payment" : "Paiement en ligne sécurisé"}</span></li>
                    <li className="flex items-start gap-3"><span className="mt-0.5 shrink-0 text-primary"><IconCheck /></span><span>{isEn ? "QR code ticket validation" : "Validation des billets par QR code"}</span></li>
                  </ul>
                  <Link href="/vote" className="vp-btn-glow mt-auto inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-background/50 px-8 text-base font-bold text-foreground transition-all hover:border-primary hover:bg-background">
                    {isEn ? "Access ticketing" : "Accéder à la billetterie"}
                  </Link>
                </motion.article>

                <motion.article
                  whileHover={{ y: -6, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="vp-premium-glow-card relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-violet-600 p-8 text-primary-foreground shadow-xl ring-1 ring-white/10"
                >
                  <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-white/10 blur-2xl animate-pulse" />
                  <div className="mb-4 inline-flex self-start items-center rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white">
                    {isEn ? "Recommended" : "Recommandé"}
                  </div>
                  <p className="mb-1 text-2xl font-extrabold text-white">{isEn ? "Partner" : "Partenaire"}</p>
                  <p className="mb-6 text-sm text-white/80">{isEn ? "For multi-event networks" : "Pour réseaux de concours"}</p>
                  <ul className="mb-8 flex-1 space-y-4 text-sm">
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-white shrink-0"><IconCheck /></span>
                      <span className="text-white/90">{isEn ? "Multi-organizer master supervision" : "Supervision centralisée multi-concours"}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-white shrink-0"><IconCheck /></span>
                      <span className="text-white/90">{isEn ? "Consolidated performance & metrics" : "Métriques et bilans financiers consolidés"}</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-0.5 text-white shrink-0"><IconCheck /></span>
                      <span className="text-white/90">{isEn ? "Priority support & customizable branding" : "Support prioritaire et design personnalisé"}</span>
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => openAuth("register")}
                    className="vp-btn-glow mt-auto inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-8 text-base font-bold text-brand-600 shadow-md hover:bg-brand-50 transition-colors"
                  >
                    {isEn ? "Activate Partner" : "Activer Partenaire"}
                  </button>
                </motion.article>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="py-20">
            <div className="container max-w-3xl px-4 md:px-6">
              <header className="mb-12 text-center space-y-3">
                <span className="vp-pill-glass inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">FAQ</span>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">{isEn ? "Common Questions" : "Questions fréquentes"}</h2>
              </header>

              <div className="space-y-4">
                {faq.map(([q, a], idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={q}
                      className="vp-glass overflow-hidden rounded-2xl border border-border/50 bg-card/5 hover:border-primary/25 transition-all duration-300"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="flex w-full cursor-pointer items-center justify-between p-6 text-left text-base font-extrabold text-foreground hover:bg-primary/5 select-none focus:outline-none"
                      >
                        <span>{q}</span>
                        <span className={`ml-6 flex-shrink-0 transition-transform duration-300 text-muted-foreground ${isOpen ? "rotate-180 text-primary" : ""}`}>
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/40 p-6 pt-4 text-sm leading-relaxed text-muted-foreground bg-background/20">
                              {a}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="py-20">
            <div className="container mx-auto max-w-3xl px-4 text-center md:px-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <GlassCard intensity="default" className="px-8 py-12 border border-primary/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                  <h2 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                    {isEn ? "Ready to launch your contest?" : "Prêt à lancer votre concours ?"}
                  </h2>
                  <p className="mt-4 text-muted-foreground max-w-lg mx-auto text-sm">
                    {isEn
                      ? "Create an account in less than a minute. No credit card required."
                      : "Créez votre compte en moins d'une minute. Aucune carte bancaire requise."}
                  </p>

                  <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                    <motion.button
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => openAuth("register")}
                      className="vp-btn-glow inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-bold text-primary-foreground transition-all hover:bg-brand-600"
                    >
                      {isEn ? "Create my account" : "Créer mon compte"}
                    </motion.button>

                    <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }}>
                      <Link href="/vote" className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-base font-bold text-background transition-all hover:bg-foreground/90 group">
                        {isEn ? "Access an event" : "Accéder à un évènement"}
                        <span className="ml-2 transition-transform group-hover:translate-x-1"><IconArrow /></span>
                      </Link>
                    </motion.div>
                  </div>
                </GlassCard>
              </motion.div>
            </div>
          </section>

          <PartnerCarousel />
        </main>
      </AmbientBackdrop>
    </>
  );
}
