"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "../../lib/i18n-provider";
import { Button, Input } from "@/components/ui";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";
import { publicEventPath } from "../../lib/site";
import { authLoginUrl } from "../../lib/auth-navigation";

export default function VoteEventEntryPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const [eventSlug, setEventSlug] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = eventSlug.trim().toLowerCase();
    if (!slug) return;
    router.push(publicEventPath(slug));
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("vote.entry.title")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t("vote.entry.subtitle")}</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            id="eventSlug"
            label={t("vote.entry.slug")}
            value={eventSlug}
            onChange={(e) => setEventSlug(e.target.value)}
            placeholder={isEn ? "ex: miss-campus-2026" : "ex: miss-campus-2026"}
            autoComplete="off"
            required
          />
          <Button type="submit" size="lg" className="vp-btn-primary-glow w-full">
            {t("vote.entry.continue")}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isEn ? "Demo: " : "Démo : "}
          <Link href="/e/miss-campus-2026" className="font-semibold text-primary hover:underline">
            Miss Campus 2026
          </Link>
        </p>
        <p className="mt-4 text-center text-sm">
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {isEn ? "Organizer sign in" : "Connexion organisateur"}
          </Link>
        </p>
      </GlassCard>
    </AuthSimpleLayout>
  );
}
