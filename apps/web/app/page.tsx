"use client";

import Link from "next/link";
import { useI18n } from "../lib/i18n-provider";
import type { MessageKey } from "../lib/i18n";
import { AppHeader } from "../components/app-header";
import { useAuthModal } from "../components/auth/auth-modal-provider";

// Lien de démonstration seulement s'il est configuré (figé au build).
const DEMO_EVENT_SLUG = process.env.NEXT_PUBLIC_DEMO_EVENT_SLUG?.trim() || null;

const STEPS: MessageKey[] = ["home.steps.1", "home.steps.2", "home.steps.3", "home.steps.4"];
const FAQ: Array<[MessageKey, MessageKey]> = [
  ["home.faq.q1", "home.faq.a1"],
  ["home.faq.q2", "home.faq.a2"],
  ["home.faq.q3", "home.faq.a3"]
];

export default function HomePage() {
  const { t } = useI18n();
  const { openAuth } = useAuthModal();

  return (
    <>
      <AppHeader />
      <main id="main-content" className="bg-background">
        <section id="hero" className="flex min-h-[78vh] items-end bg-slate-900 text-white">
          <div className="w-full px-5 pb-16 pt-16 md:px-16 md:pb-24">
            <div className="max-w-[34rem]">
              <p className="text-xs font-medium text-white/70">{t("home.meta")}</p>
              <h1 className="mt-4 text-[clamp(2.25rem,6vw,3.75rem)] font-extrabold leading-[1.05] tracking-tight">
                {t("home.title1")}
                <br />
                {t("home.title2")}
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/80">{t("home.lead")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <button
                  type="button"
                  onClick={() => openAuth("register")}
                  className="inline-flex h-12 items-center rounded-md bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  {t("home.cta")}
                </button>
                {DEMO_EVENT_SLUG ? (
                  <Link
                    href={`/e/${encodeURIComponent(DEMO_EVENT_SLUG)}`}
                    className="inline-flex min-h-11 items-center text-base font-semibold text-white underline underline-offset-4"
                  >
                    {t("home.demo")}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="border-b border-border px-5 py-8 md:px-16">
          <p className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-semibold text-slate-900">
            <span>{t("home.strip.payment")}</span>
            <span>{t("home.strip.withdrawal")}</span>
          </p>
        </div>

        <section aria-labelledby="steps-title" className="px-5 pb-16 pt-24 md:px-16">
          <div className="max-w-xl">
            <h2 id="steps-title" className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              {t("home.steps.title")}
            </h2>
            <ol className="mt-4">
              {STEPS.map((key, index) => (
                <li key={key} className="flex gap-5 border-t border-border py-5 first:border-t-0">
                  <span className="w-8 shrink-0 text-4xl font-extrabold leading-none text-slate-300 tabular-nums" aria-hidden="true">
                    {index + 1}
                  </span>
                  <p className="text-base leading-relaxed text-slate-900">{t(key)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="payments-title" className="border-t border-border px-5 py-10 md:px-16">
          <div className="max-w-xl">
            <h2 id="payments-title" className="text-lg font-bold text-slate-900">{t("home.payments.title")}</h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">{t("home.payments.body")}</p>
          </div>
        </section>

        <section id="argent" aria-labelledby="money-title" className="border-t border-border px-5 pb-16 pt-24 md:px-16">
          <div className="max-w-2xl">
            <h2 id="money-title" className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              {t("home.money.title")}
            </h2>
            <div className="mt-4 space-y-4 text-base leading-relaxed text-slate-600">
              <p>{t("home.money.p1")}</p>
              <p>{t("home.money.p2")}</p>
              <p>{t("home.money.p3")}</p>
            </div>
            <button
              type="button"
              onClick={() => openAuth("register")}
              className="mt-8 inline-flex h-12 items-center rounded-md bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("home.cta")}
            </button>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="px-5 pb-24 pt-10 md:px-16">
          <div className="max-w-2xl">
            <h2 id="faq-title" className="text-lg font-bold text-slate-900">{t("home.faq.title")}</h2>
            <dl className="mt-4">
              {FAQ.map(([q, a]) => (
                <div key={q} className="border-t border-border py-5">
                  <dt className="font-semibold text-slate-900">{t(q)}</dt>
                  <dd className="mt-1 text-slate-600">{t(a)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
    </>
  );
}
