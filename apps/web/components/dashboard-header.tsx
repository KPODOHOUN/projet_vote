"use client";

import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UserCircle, Calendar, Users, CreditCard, UserPlus, Bell } from "lucide-react";
import { useI18n } from "../lib/i18n-provider";
import { apiFetch } from "../lib/api";
import { getStoredToken, clearAuthStorage } from "../lib/auth";
import { search, searchResultHref, type SearchResults } from "../lib/search";
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  notificationText,
  notificationHref,
  type AppNotification,
} from "../lib/notifications";

export function DashboardHeader() {
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<AppNotification[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Poll unread count (~30s) + initial fetch.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    let active = true;
    const poll = () => { void unreadCount(token).then((r) => { if (active) setNotifCount(r.count); }).catch(() => {}); };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Close notifications panel on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setNotifOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openNotifs = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      const token = getStoredToken();
      if (!token) return;
      setNotifLoading(true); setNotifError(false);
      void listNotifications(token, { limit: 10 })
        .then((r) => { setNotifItems(r.items); setNotifLoading(false); })
        .catch(() => { setNotifError(true); setNotifLoading(false); });
    }
  };

  const onNotifClick = (n: AppNotification) => {
    const token = getStoredToken();
    if (token) void markRead(token, n.id).then(() => setNotifCount((c) => Math.max(0, c - 1))).catch(() => {});
    setNotifOpen(false);
    router.push(notificationHref(n));
  };

  const onMarkAll = () => {
    const token = getStoredToken();
    if (token) void markAllRead(token).then(() => { setNotifCount(0); setNotifItems((items) => items?.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() })) ?? null); }).catch(() => {});
  };

  const logout = async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    clearAuthStorage();
    router.push(authLoginUrl());
  };

  // Debounce 250ms + ignore stale responses (reqId) + abort in-flight.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setIsLoading(false); setError(false); return; }
    const token = getStoredToken();
    if (!token) return;
    const controller = new AbortController();
    const id = ++reqId.current;
    setIsLoading(true); setError(false);
    const timer = setTimeout(() => {
      void search(token, term, 5, controller.signal)
        .then((res) => { if (id === reqId.current) { setResults(res); setIsLoading(false); } })
        .catch(() => { if (id === reqId.current) { setError(true); setIsLoading(false); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (href: string) => { setIsOpen(false); setQ(""); router.push(href); };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length >= 2) { setIsOpen(false); router.push(`/dashboard/search?q=${encodeURIComponent(term)}`); }
  };

  const hasAny = results != null && (results.events.length + results.candidates.length + results.members.length + results.payments.length) > 0;

  return (
    <header className="vp-header-glass sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 px-6 sm:px-8">
      <div ref={boxRef} className="relative flex-1 max-w-md">
        <form onSubmit={onSubmit} role="search" className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            className="flex h-10 w-full rounded-full border border-input bg-background/50 pl-10 pr-4 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-background"
            placeholder={t("search.placeholder")}
            aria-label={t("search.label")}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => { if (e.key === "Escape") setIsOpen(false); }}
          />
        </form>
        {isOpen && q.trim().length >= 2 ? (
          <div className="vp-search-panel absolute top-full left-0 mt-2 w-full sm:w-[400px] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50 flex flex-col max-h-[70vh]" aria-label={t("search.label")}>
            {isLoading ? (
              <p className="p-4 text-sm text-center text-muted-foreground">{t("search.loading")}</p>
            ) : error ? (
              <p className="p-4 text-sm text-center text-destructive">{t("search.error")}</p>
            ) : !hasAny ? (
              <p className="p-4 text-sm text-center text-muted-foreground">{t("search.noResults")}</p>
            ) : (
              <div className="overflow-y-auto">
                {results!.events.length > 0 ? (
                  <div className="py-2">
                    <span className="flex items-center gap-2 px-4 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><Calendar className="size-3.5" aria-hidden="true" /> {t("search.groupEvents")}</span>
                    {results!.events.map((it) => (
                      <button key={it.id} type="button" className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors flex flex-col" onClick={() => go(searchResultHref("event", it))}>
                        <strong className="text-sm font-medium text-foreground">{it.title}</strong><span className="text-xs text-muted-foreground">{it.status}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results!.candidates.length > 0 ? (
                  <div className="py-2 border-t border-border/50">
                    <span className="flex items-center gap-2 px-4 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><Users className="size-3.5" aria-hidden="true" /> {t("search.groupCandidates")}</span>
                    {results!.candidates.map((it) => (
                      <button key={it.id} type="button" className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors flex flex-col" onClick={() => go(searchResultHref("candidate", it))}>
                        <strong className="text-sm font-medium text-foreground">{it.fullName}</strong><span className="text-xs text-muted-foreground">{t("search.candidateOn")} {it.eventTitle}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results!.members.length > 0 ? (
                  <div className="py-2 border-t border-border/50">
                    <span className="flex items-center gap-2 px-4 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><UserPlus className="size-3.5" aria-hidden="true" /> {t("search.groupMembers")}</span>
                    {results!.members.map((it) => (
                      <button key={it.id} type="button" className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors flex flex-col" onClick={() => go(searchResultHref("member", it))}>
                        <strong className="text-sm font-medium text-foreground">{it.email}</strong><span className="text-xs text-muted-foreground">{it.role}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {results!.payments.length > 0 ? (
                  <div className="py-2 border-t border-border/50">
                    <span className="flex items-center gap-2 px-4 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><CreditCard className="size-3.5" aria-hidden="true" /> {t("search.groupPayments")}</span>
                    {results!.payments.map((it) => (
                      <button key={it.id} type="button" className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors flex flex-col" onClick={() => go(searchResultHref("payment", it))}>
                        <strong className="text-sm font-medium text-foreground">{it.providerRef ?? "…"}</strong><span className="text-xs text-muted-foreground">{it.amountCfa.toLocaleString(isEn ? "en-GB" : "fr-FR")} XOF · {it.status}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="p-2 border-t border-border/50 bg-muted/20">
                  <Link href={`/dashboard/search?q=${encodeURIComponent(q.trim())}`} className="block w-full text-center py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors rounded-md hover:bg-primary/5 hover:underline" onClick={() => setIsOpen(false)}>
                    {t("search.seeAll")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div ref={bellRef} className="relative">
          <button type="button" className="relative p-2 rounded-full hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={openNotifs} aria-label={`${t("notif.bellLabel")} (${notifCount})`}>
            <Bell className="h-5 w-5" aria-hidden="true" />
            {notifCount > 0 ? <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground transform translate-x-1/4 -translate-y-1/4">{notifCount > 9 ? "9+" : notifCount}</span> : null}
          </button>
          {notifOpen ? (
            <div className="absolute right-0 top-full mt-2 w-[320px] sm:w-[380px] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50 flex flex-col max-h-[70vh]" aria-label={t("notif.title")}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
                <strong className="text-sm font-semibold">{t("notif.title")}</strong>
                <button type="button" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors" onClick={onMarkAll}>{t("notif.markAllRead")}</button>
              </div>
              {notifLoading ? (
                <p className="p-4 text-sm text-center text-muted-foreground">{t("notif.loading")}</p>
              ) : notifError ? (
                <p className="p-4 text-sm text-center text-destructive">{t("notif.error")}</p>
              ) : !notifItems || notifItems.length === 0 ? (
                <p className="p-4 text-sm text-center text-muted-foreground">{t("notif.empty")}</p>
              ) : (
                <div className="overflow-y-auto divide-y divide-border/50">
                  {notifItems.map((n) => (
                    <button key={n.id} type="button" className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex flex-col gap-1 ${n.readAt ? "opacity-70" : "bg-primary/5"}`} onClick={() => onNotifClick(n)}>
                      {/* t accepte un sur-ensemble de clés ; notificationText n'invoque t() qu'avec des clés notif.* existantes → cast sûr. */}
                      <span className={`text-sm ${n.readAt ? "text-muted-foreground" : "text-foreground font-medium"}`}>{notificationText(n, t as (key: string) => string, isEn)}</span>
                      <time className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}</time>
                    </button>
                  ))}
                </div>
              )}
              <div className="p-2 border-t border-border/50 bg-muted/20">
                <Link href="/dashboard/notifications" className="block w-full text-center py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors rounded-md hover:bg-primary/5 hover:underline" onClick={() => setNotifOpen(false)}>{t("notif.seeAll")}</Link>
              </div>
            </div>
          ) : null}
        </div>
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserCircle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <span className="hidden md:inline">{t("common.account")}</span>
        </span>
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {t("nav.logout")}
        </button>
      </div>
    </header>
  );
}
