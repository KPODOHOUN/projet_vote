"use client";

import { useI18n } from "../../lib/i18n-provider";
import { useAuthModal } from "../../components/auth/auth-modal-provider";
import { AppHeader } from "../../components/app-header";

/**
 * /pricing (7.4) : même contenu que « Comment l'argent est séparé » sur la Home.
 * Aucun taux ni délai public (D5) : le taux est indiqué avant l'activation.
 */
export default function PricingPage() {
  const { t } = useI18n();
  const { openAuth } = useAuthModal();

  return (
    <>
      <AppHeader />
      <main id="main-content" className="bg-background px-5 pb-24 pt-16 md:px-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{t("home.money.title")}</h1>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
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
      </main>
    </>
  );
}
