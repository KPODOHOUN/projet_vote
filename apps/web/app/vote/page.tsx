"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "../../lib/i18n-provider";
import { Button, Card, Input } from "@/components/ui";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { publicEventPath } from "../../lib/site";
import { authLoginUrl } from "../../lib/auth-navigation";

// Lien de démonstration seulement s'il est configuré (figé au build).
const DEMO_EVENT_SLUG = process.env.NEXT_PUBLIC_DEMO_EVENT_SLUG?.trim() || null;

export default function VoteEventEntryPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [eventSlug, setEventSlug] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = eventSlug.trim().toLowerCase();
    if (!slug) return;
    router.push(publicEventPath(slug));
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("vote.entry.title")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t("vote.entry.subtitle")}</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            id="eventSlug"
            label={t("vote.entry.slug")}
            value={eventSlug}
            onChange={(e) => setEventSlug(e.target.value)}
            placeholder={t("vote.entry.placeholder")}
            autoComplete="off"
            required
          />
          <Button type="submit" size="lg" className="w-full">
            {t("vote.entry.continue")}
          </Button>
        </form>
        {DEMO_EVENT_SLUG ? (
          <p className="mt-6 text-sm">
            <Link href={publicEventPath(DEMO_EVENT_SLUG)} className="font-semibold text-primary underline-offset-4 hover:underline">
              {t("vote.entry.demo")}
            </Link>
          </p>
        ) : null}
        <p className="mt-4 text-sm">
          <Link href={authLoginUrl()} className="font-semibold text-primary underline-offset-4 hover:underline">
            {t("vote.entry.organizerLogin")}
          </Link>
        </p>
      </Card>
    </AuthSimpleLayout>
  );
}
