"use client";

import { useEffect, useState } from "react";

export type Testimonial = {
  initials: string;
  name: string;
  roleFr: string;
  roleEn: string;
  quoteFr: string;
  quoteEn: string;
};

type TestimonialsCarouselProps = {
  items: Testimonial[];
  isEn?: boolean;
  intervalMs?: number;
};

export function TestimonialsCarousel({ items, isEn = false, intervalMs = 5000 }: TestimonialsCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
      setProgressKey((k) => k + 1);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion, items.length, intervalMs]);

  useEffect(() => {
    setProgressKey((k) => k + 1);
  }, [index]);

  if (items.length === 0) return null;

  return (
    <div
      className="relative mx-auto max-w-6xl"
      role="region"
      aria-label={isEn ? "Testimonials carousel" : "Carrousel témoignages"}
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-background via-background to-primary/5 p-1 shadow-xl">
        <div className="h-1 overflow-hidden rounded-t-[1.35rem] bg-muted/40">
          <div
            key={progressKey}
            className={`h-full origin-left bg-primary ${paused || reduceMotion ? "w-full" : "animate-testimonial-progress"}`}
            style={{ animationDuration: `${intervalMs}ms` }}
            aria-hidden="true"
          />
        </div>
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((item) => (
            <article
              key={item.name}
              className="flex w-full shrink-0 flex-col items-center px-6 py-10 text-center md:px-12 md:py-14"
            >
              <div
                className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
                aria-hidden="true"
              >
                {item.initials}
              </div>
              <blockquote className="max-w-3xl text-xl font-medium leading-snug text-foreground md:text-2xl lg:text-3xl">
                &ldquo;{isEn ? item.quoteEn : item.quoteFr}&rdquo;
              </blockquote>
              <div className="mt-8 flex flex-col gap-1">
                <strong className="text-lg text-foreground">{item.name}</strong>
                <span className="text-sm text-muted-foreground">{isEn ? item.roleEn : item.roleFr}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {items.map((item, dotIndex) => (
          <button
            key={item.name}
            type="button"
            aria-label={isEn ? `Show testimonial ${dotIndex + 1}` : `Afficher le témoignage ${dotIndex + 1}`}
            aria-current={dotIndex === index ? "true" : undefined}
            onClick={() => {
              setIndex(dotIndex);
              setProgressKey((k) => k + 1);
            }}
            className={`h-2.5 rounded-full transition-all ${
              dotIndex === index ? "w-8 bg-primary" : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
