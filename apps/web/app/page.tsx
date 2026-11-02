"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, Plus, QrCode, Smartphone, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import type { MessageKey } from "../lib/i18n";
import { AppHeader } from "../components/app-header";
import { useAuthModal } from "../components/auth/auth-modal-provider";
import { MOBILE_NETWORKS } from "../lib/mobile-networks";
import { HeroVisual, LandingMotion, Reveal, StyleSwitcher } from "../components/landing/landing-parts";

// Lien de démonstration seulement s'il est configuré (figé au build).
const DEMO_EVENT_SLUG = process.env.NEXT_PUBLIC_DEMO_EVENT_SLUG?.trim() || null;

// Réseaux acceptés quel que soit le prestataire (FedaPay ne débite pas Celtiis).
const OPERATORS = MOBILE_NETWORKS.filter((network) => network.value !== "celtiis").map((network) => network.label);

const STEPS: Array<[MessageKey, MessageKey]> = [
  ["home.l.s1.title", "home.l.s1.body"],
  ["home.l.s2.title", "home.l.s2.body"],
  ["home.l.s3.title", "home.l.s3.body"],
  ["home.l.s4.title", "home.l.s4.body"]
];

const MONEY: Array<[LucideIcon, MessageKey, MessageKey]> = [
  [Smartphone, "home.l.m1.title", "home.l.m1.body"],
  [Check, "home.l.m2.title", "home.l.m2.body"],
  [Wallet, "home.l.m3.title", "home.l.m3.body"],
  [BadgeCheck, "home.l.m4.title", "home.l.m4.body"]
];

const AUDIENCE: MessageKey[] = ["home.l.who.1", "home.l.who.2", "home.l.who.3", "home.l.who.4", "home.l.who.5", "home.l.who.6"];

const FAQ: Array<[MessageKey, MessageKey]> = [
  ["home.faq.q1", "home.faq.a1"],
  ["home.faq.q2", "home.faq.a2"],
  ["home.faq.q3", "home.faq.a3"]
];

const primaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const ghostBtn =
  "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-lg border border-border bg-white px-6 text-[15px] font-semibold text-slate-900 transition-colors hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const cardHover = "transition-shadow hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.45)]";

function SectionHead({ eyebrow, title, center = false }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <Reveal className={`mb-10 max-w-xl md:mb-12 ${center ? "mx-auto text-center" : ""}`}>
      <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>
      <h2 className="mt-2 text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-tight tracking-tight text-slate-900">{title}</h2>
    </Reveal>
  );
}

export default function HomePage() {
  const { t } = useI18n();
  const { openAuth } = useAuthModal();
  const register = () => openAuth("register");

  return (
    <LandingMotion>
      <AppHeader />
      <main id="main-content" className="overflow-x-clip bg-background">
        {/* Accroche */}
        <section className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_70%_30%,#000,transparent)]"
          />
          <div className="relative mx-auto grid w-[min(1160px,100%-2rem)] items-center gap-12 py-14 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-700">
                <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                {t("home.l.badge")}
              </span>
              <h1 className="mt-5 text-[clamp(2.4rem,4.8vw,3.75rem)] font-extrabold leading-[1.05] tracking-tight text-slate-900">
                {t("home.l.title1")}
                <br />
                <span className="text-brand-600">{t("home.l.title2")}</span>
              </h1>
              <p className="mt-5 max-w-[34ch] text-lg text-slate-600">{t("home.l.lead")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={register} className={primaryBtn}>
                  {t("home.l.ctaMain")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
                {DEMO_EVENT_SLUG ? (
                  <Link href={`/e/${encodeURIComponent(DEMO_EVENT_SLUG)}`} className={ghostBtn}>
                    {t("home.demo")}
                  </Link>
                ) : null}
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                {(["home.l.check1", "home.l.check2"] as MessageKey[]).map((key) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <Check className="size-4 text-emerald-700" strokeWidth={2.6} aria-hidden="true" />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual toastTitle={t("home.l.toastTitle")} toastBody={t("home.l.toastBody")} />
          </div>
        </section>

        {/* Opérateurs */}
        <div className="border-y border-border bg-slate-50">
          <div className="mx-auto flex w-[min(1160px,100%-2rem)] flex-wrap items-center justify-center gap-x-10 gap-y-3 py-5 text-sm text-slate-600">
            <span>{t("home.l.opsLabel")}</span>
            {OPERATORS.map((name) => (
              <span key={name} className="font-display text-lg font-extrabold tracking-tight text-slate-900">
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Fonctions */}
        <section id="fonctions" className="mx-auto w-[min(1160px,100%-2rem)] scroll-mt-20 py-20 md:py-28">
          <SectionHead eyebrow={t("home.l.features.eyebrow")} title={t("home.l.features.title")} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Reveal className={`group flex flex-col overflow-hidden rounded-2xl border border-border bg-white sm:col-span-2 lg:col-span-1 ${cardHover}`}>
              <div className="flex aspect-[4/3] items-start gap-3 overflow-hidden border-b border-border bg-slate-50 p-5">
                {(["soiree-home", "wax-home", "stade-home"] as const).map((name, index) => (
                  <div
                    key={name}
                    className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-transform duration-300 group-hover:-translate-y-1"
                    style={{ marginTop: `${index * 18}px`, transitionDelay: `${index * 40}ms` }}
                  >
                    <Image src={`/landing/${name}.webp`} alt="" width={800} height={1200} sizes="140px" className="aspect-[3/4.4] w-full object-cover object-top" />
                  </div>
                ))}
              </div>
              <div className="p-6">
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{t("home.l.f1.title")}</h3>
                <p className="mt-1.5 text-[15px] text-slate-600">{t("home.l.f1.body")}</p>
              </div>
            </Reveal>

            <Reveal delay={0.06} className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-white ${cardHover}`}>
              <div className="aspect-[4/3] overflow-hidden border-b border-border bg-slate-50">
                <Image
                  src="/landing/couronne-results.webp"
                  alt="Résultats en direct d'un concours"
                  width={1200}
                  height={1135}
                  sizes="(min-width: 1024px) 370px, 50vw"
                  className="h-full w-full object-cover object-left-top"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{t("home.l.f2.title")}</h3>
                <p className="mt-1.5 text-[15px] text-slate-600">{t("home.l.f2.body")}</p>
              </div>
            </Reveal>

            <Reveal delay={0.12} className={`group flex flex-col overflow-hidden rounded-2xl border border-border bg-white ${cardHover}`}>
              <div className="grid aspect-[4/3] place-items-center border-b border-border bg-slate-50 p-6" aria-hidden="true">
                <div className="grid w-full max-w-[300px] grid-cols-[1fr_auto] rounded-xl border border-border bg-white shadow-[0_18px_36px_-22px_rgba(15,23,42,0.45)] transition-transform duration-300 group-hover:-rotate-1">
                  <div className="p-4">
                    <p className="text-xs text-slate-600">{t("home.l.ticket.label")}</p>
                    <p className="mt-1 font-display text-base font-extrabold text-slate-900">Miss Campus 2026</p>
                    <p className="mt-2 text-xs text-slate-600">{t("home.l.ticket.entry")}</p>
                  </div>
                  <div className="grid place-items-center border-l border-dashed border-border px-4 text-slate-900">
                    <QrCode className="size-12" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{t("home.l.f3.title")}</h3>
                <p className="mt-1.5 text-[15px] text-slate-600">{t("home.l.f3.body")}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Styles */}
        <section className="border-y border-border bg-slate-50/60">
          <div className="mx-auto w-[min(1160px,100%-2rem)] py-20 md:py-28">
            <SectionHead eyebrow={t("home.l.styles.eyebrow")} title={t("home.l.styles.title")} />
            <StyleSwitcher pickLabel={t("home.l.styles.pick")} />
          </div>
        </section>

        {/* Étapes */}
        <section id="comment" className="mx-auto w-[min(1160px,100%-2rem)] scroll-mt-20 py-20 md:py-28">
          <SectionHead center eyebrow={t("home.l.how.eyebrow")} title={t("home.l.how.title")} />
          <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[42px] hidden h-px bg-border lg:block" />
            {STEPS.map(([title, body], index) => (
              <Reveal as="li" key={title} delay={index * 0.08} className="relative rounded-2xl border border-border bg-white p-6 text-center">
                <span className="mx-auto grid size-9 place-items-center rounded-xl bg-brand-50 font-display text-[15px] font-extrabold text-brand-700 ring-4 ring-white">
                  {index + 1}
                </span>
                <h3 className={`mt-4 text-lg font-extrabold tracking-tight ${index === 2 ? "text-brand-600" : "text-slate-900"}`}>{t(title)}</h3>
                <p className="mt-1.5 text-[15px] text-slate-600">{t(body)}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* L'argent */}
        <section id="argent" className="mx-auto w-[min(1160px,100%-2rem)] scroll-mt-20">
          <Reveal className="grid items-center gap-10 rounded-3xl bg-slate-900 p-8 text-white md:p-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
            <div>
              <p className="text-sm font-semibold text-brand-300">{t("home.l.money.eyebrow")}</p>
              <h2 className="mt-2 text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-tight tracking-tight">{t("home.l.money.title")}</h2>
              <p className="mt-3 text-slate-300">{t("home.l.money.intro")}</p>
              <Link href="/pricing" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline">
                {t("home.l.money.more")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <ul className="relative grid gap-3">
              <span aria-hidden="true" className="absolute bottom-8 left-[38px] top-8 w-px bg-white/15" />
              {MONEY.map(([Icon, title, body]) => (
                <li key={title} className="relative grid grid-cols-[40px_1fr] items-center gap-4 rounded-xl border border-white/10 bg-slate-900 px-4 py-4">
                  <span className="grid size-10 place-items-center rounded-lg bg-brand-400/15 text-brand-300">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold">{t(title)}</span>
                    <span className="block text-sm text-slate-300">{t(body)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* Pour qui */}
        <section className="mx-auto w-[min(1160px,100%-2rem)] py-20 md:py-28">
          <SectionHead center eyebrow={t("home.l.who.eyebrow")} title={t("home.l.who.title")} />
          <Reveal>
            <ul className="flex flex-wrap justify-center gap-2.5">
              {AUDIENCE.map((key) => (
                <li key={key} className="rounded-full border border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-slate-900">
                  {t(key)}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* Questions */}
        <section id="faq" className="mx-auto w-[min(760px,100%-2rem)] pb-20 md:pb-28">
          <SectionHead center eyebrow={t("home.faq.title")} title={t("home.l.faq.title")} />
          <Reveal className="border-t border-border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-b border-border">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 font-display text-[17px] font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {t(q)}
                  <Plus className="size-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="pb-5 pr-10 text-slate-600">{t(a)}</p>
              </details>
            ))}
          </Reveal>
        </section>

        {/* Appel final */}
        <section className="mx-auto w-[min(1160px,100%-2rem)] pb-20 md:pb-28">
          <Reveal className="relative overflow-hidden rounded-3xl bg-brand-600 px-6 py-14 text-center text-white md:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,#000,transparent)]"
            />
            <div className="relative">
              <h2 className="text-[clamp(1.75rem,3.4vw,2.75rem)] font-extrabold leading-tight tracking-tight">{t("home.l.cta.title")}</h2>
              <p className="mt-3 text-lg text-brand-100">{t("home.l.cta.body")}</p>
              <button
                type="button"
                onClick={register}
                className="mt-8 inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-6 text-[15px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
              >
                {t("home.l.ctaMain")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </Reveal>
        </section>
      </main>
    </LandingMotion>
  );
}
