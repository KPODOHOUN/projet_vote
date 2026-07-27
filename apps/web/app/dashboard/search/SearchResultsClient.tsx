"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n-provider";
import { getStoredToken } from "../../../lib/auth";
import { search, searchResultHref, type SearchResults } from "../../../lib/search";
import { LoadingState, EmptyState } from "@/components/ui";

export function SearchResultsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const q = params.get("q") ?? "";
  const [term, setTerm] = useState(q);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setTerm(q); }, [q]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults(null); return; }
    const token = getStoredToken();
    if (!token) { router.push(authLoginUrl()); return; }
    setIsLoading(true); setError("");
    void search(token, trimmed, 20)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : t("search.error")))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, router]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.replace(`/dashboard/search?q=${encodeURIComponent(term.trim())}`);
  };

  const total = results ? results.events.length + results.candidates.length + results.members.length + results.payments.length : 0;

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div className="space-y-1">
          <span className="text-sm font-bold tracking-widest uppercase text-primary block">{isEn ? "Search" : "Recherche"}</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{t("search.resultsTitle")}</h2>
        </div>
      </header>

      <form className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col sm:flex-row items-end gap-4" onSubmit={onSubmit} role="search">
        <div className="grid gap-1.5 w-full">
          <label className="text-sm font-medium leading-none">
            {t("search.label")}
          </label>
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </form>

      {q.trim().length < 2 ? (
        <p className="text-muted-foreground">{t("search.prompt")}</p>
      ) : isLoading ? (
        <LoadingState variant="rows" count={5} label={t("search.loading")} />
      ) : error ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">{error}</div>
      ) : total === 0 ? (
        <EmptyState title={t("search.noResults")} description={t("search.prompt")} />
      ) : (
        <div className="space-y-8">
          {results!.events.length > 0 ? (
            <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("search.groupEvents")}</h3>
              <ul className="vp-event-rows space-y-3">
                {results!.events.map((it) => (
                  <li key={it.id}>
                    <Link href={searchResultHref("event", it)} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 bg-background hover:border-primary/50 transition-colors gap-2">
                      <strong className="text-foreground">{it.title}</strong>
                      <span className="text-sm text-muted-foreground">{it.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {results!.candidates.length > 0 ? (
            <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("search.groupCandidates")}</h3>
              <ul className="space-y-3">
                {results!.candidates.map((it) => (
                  <li key={it.id}>
                    <Link href={searchResultHref("candidate", it)} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 bg-background hover:border-primary/50 transition-colors gap-2">
                      <strong className="text-foreground">{it.fullName}</strong>
                      <span className="text-sm text-muted-foreground">{t("search.candidateOn")} {it.eventTitle}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {results!.members.length > 0 ? (
            <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("search.groupMembers")}</h3>
              <ul className="space-y-3">
                {results!.members.map((it) => (
                  <li key={it.id}>
                    <Link href={searchResultHref("member", it)} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 bg-background hover:border-primary/50 transition-colors gap-2">
                      <strong className="text-foreground">{it.email}</strong>
                      <span className="text-sm text-muted-foreground">{it.role}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {results!.payments.length > 0 ? (
            <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("search.groupPayments")}</h3>
              <ul className="space-y-3">
                {results!.payments.map((it) => (
                  <li key={it.id}>
                    <Link href={searchResultHref("payment", it)} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border/50 bg-background hover:border-primary/50 transition-colors gap-2">
                      <strong className="text-foreground">{it.providerRef ?? "…"}</strong>
                      <span className="text-sm text-muted-foreground">{it.amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF · {it.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
