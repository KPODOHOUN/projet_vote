"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n-provider";

type Partner = {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string | null;
};

export function PartnerCarousel() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/v1/display-partners")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPartners(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || partners.length === 0) return null;

  // Duplicate for seamless infinite scroll
  const items = [...partners, ...partners];

  return (
    <section className="py-12 md:py-16 bg-muted/30 border-y border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <h2 className="text-center text-sm font-bold uppercase tracking-widest text-muted-foreground mb-8">
          {isEn ? "Our Partners" : "Nos Partenaires"}
        </h2>
        <div className="overflow-hidden" ref={containerRef}>
          <div className="flex gap-8 md:gap-12 animate-scroll">
            {items.map((partner, i) => (
              <a
                key={`${partner.id}-${i}`}
                href={partner.websiteUrl ?? "#"}
                target={partner.websiteUrl ? "_blank" : undefined}
                rel="noreferrer"
                className="flex-shrink-0 flex items-center justify-center h-16 w-36 md:w-44 rounded-xl bg-background border border-border p-3 hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <img
                  src={partner.logoUrl}
                  alt={partner.name}
                  className="max-h-full max-w-full object-contain grayscale hover:grayscale-0 transition-all"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
