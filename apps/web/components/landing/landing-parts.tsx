"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Respecte « réduire les animations » sans changer le rendu serveur :
 * framer coupe lui-même les déplacements, seuls les fondus restent.
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Apparition au défilement. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div"
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li";
}) {
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: EASE_OUT }}
    >
      {children}
    </Tag>
  );
}

/** Vraies captures : page d'un concours, sa version téléphone, et la confirmation de paiement. */
export function HeroVisual({ toastTitle, toastBody }: { toastTitle: string; toastBody: string }) {
  return (
    <div className="relative pb-10 pl-8 sm:pb-12 sm:pl-12">
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_30px_60px_-30px_rgba(15,23,42,0.35)]">
        <Image
          src="/landing/couronne-home.webp"
          alt="Page d'un concours Miss Campus au style Couronne"
          width={736}
          height={1200}
          priority
          sizes="(min-width: 1024px) 560px, 90vw"
          className="aspect-[16/11] w-full object-cover object-top"
        />
      </div>
      <motion.div
        className="absolute bottom-0 left-0 w-[30%] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_48px_-20px_rgba(15,23,42,0.45)]"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image
          src="/landing/campus-mobile.webp"
          alt="Page d'un concours sur téléphone"
          width={555}
          height={1200}
          sizes="(min-width: 1024px) 170px, 30vw"
          className="aspect-[555/1000] w-full object-cover object-top"
        />
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="absolute -right-2 top-[10%] flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-[0_16px_32px_-16px_rgba(15,23,42,0.4)] sm:-right-5"
        initial={{ opacity: 0, x: 24, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.7, ease: EASE_OUT }}
      >
        <span className="grid size-8 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <span>
          <span className="block font-semibold text-slate-900">{toastTitle}</span>
          <span className="block text-slate-600">{toastBody}</span>
        </span>
      </motion.div>
    </div>
  );
}

const STYLES = [
  { name: "Couronne", src: "/landing/couronne-home.webp", w: 736 },
  { name: "Soirée", src: "/landing/soiree-home.webp", w: 820 },
  { name: "Affiche", src: "/landing/affiche-home.webp", w: 812 },
  { name: "Wax", src: "/landing/wax-home.webp", w: 765 },
  { name: "Stade", src: "/landing/stade-home.webp", w: 775 },
  { name: "Campus", src: "/landing/campus-mobile.webp", w: 555 }
] as const;

const AUTO_MS = 3800;

/** Sélecteur de styles : un clic change la page affichée. Défile seul tant qu'on n'y touche pas. */
export function StyleSwitcher({ pickLabel }: { pickLabel: string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (reduce || paused || touched) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % STYLES.length), AUTO_MS);
    return () => window.clearInterval(id);
  }, [reduce, paused, touched]);

  const select = (index: number) => {
    setTouched(true);
    setActive(index);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + STYLES.length) % STYLES.length;
    select(next);
    tabsRef.current[next]?.focus();
  };

  const current = STYLES[active] ?? STYLES[0];

  return (
    <div
      className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div role="tablist" aria-label={pickLabel} aria-orientation="vertical" onKeyDown={onKeyDown} className="flex flex-wrap gap-2 md:flex-col md:gap-1">
        {STYLES.map((style, index) => {
          const selected = index === active;
          return (
            <button
              key={style.name}
              ref={(el) => {
                tabsRef.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`style-tab-${index}`}
              aria-selected={selected}
              aria-controls="style-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(index)}
              className={`relative flex min-h-11 items-center gap-3 rounded-lg px-4 text-left text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-14 md:text-xl md:font-extrabold md:tracking-tight ${
                selected ? "bg-slate-900 text-white md:bg-transparent md:text-slate-900" : "bg-slate-100 text-slate-600 hover:text-slate-900 md:bg-transparent"
              }`}
            >
              <span className="hidden w-6 text-sm font-semibold tabular-nums text-slate-400 md:inline">{String(index + 1).padStart(2, "0")}</span>
              <span className="font-display">{style.name}</span>
              <span
                aria-hidden="true"
                className={`ml-auto hidden h-0.5 rounded-full bg-brand-600 transition-all duration-300 md:block ${selected ? "w-12 opacity-100" : "w-0 opacity-0"}`}
              />
            </button>
          );
        })}
      </div>

      <div id="style-panel" role="tabpanel" aria-labelledby={`style-tab-${active}`} className="relative mx-auto w-full max-w-[420px]">
        <div aria-hidden="true" className="absolute inset-x-6 -bottom-3 top-3 rounded-2xl border border-border bg-slate-50" />
        <div aria-hidden="true" className="absolute inset-x-3 -bottom-1.5 top-1.5 rounded-2xl border border-border bg-white" />
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_30px_60px_-30px_rgba(15,23,42,0.4)]">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={current.name}
              className="absolute inset-0"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.15 : 0.45, ease: EASE_OUT }}
            >
              <Image
                src={current.src}
                alt={`Page d'un concours au style ${current.name}`}
                width={current.w}
                height={1200}
                sizes="(min-width: 768px) 420px, 90vw"
                className="h-full w-full object-cover object-top"
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
