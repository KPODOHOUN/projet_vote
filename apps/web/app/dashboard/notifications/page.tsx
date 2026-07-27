"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { listNotifications, markRead, markAllRead, notificationText, notificationHref, type AppNotification } from "../../../lib/notifications";
import { Button, LoadingState, EmptyState } from "@/components/ui";

export default function NotificationsPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const [markAllError, setMarkAllError] = useState("");

  const reload = async (token: string) => {
    const res = await listNotifications(token, { limit: 50 });
    setItems(res.items);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { router.push(authLoginUrl()); return; }
    setIsLoading(true); setError("");
    void reload(token)
      .catch((e) => setError(e instanceof Error ? e.message : t("notif.error")))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onItem = (n: AppNotification) => {
    const token = getStoredToken();
    if (token) void markRead(token, n.id).catch(() => {});
    router.push(notificationHref(n));
  };

  const onMarkAll = async () => {
    const token = getStoredToken();
    if (!token) return;
    setMarkAllBusy(true); setMarkAllError("");
    try {
      await markAllRead(token);
      await reload(token);
    } catch (e) {
      setMarkAllError(e instanceof Error ? e.message : t("notif.markAllError"));
    } finally {
      setMarkAllBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div className="space-y-1">
          <span className="text-sm font-bold tracking-widest uppercase text-primary block">{isEn ? "Activity" : "Activité"}</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{t("notif.title")}</h2>
        </div>
        {items.some((n) => !n.readAt) ? (
          <Button type="button" variant="secondary" loading={markAllBusy} onClick={() => void onMarkAll()}>{t("notif.markAllRead")}</Button>
        ) : null}
      </header>

      {markAllError ? <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">{markAllError}</div> : null}

      {isLoading ? (
        <LoadingState variant="rows" count={5} label={t("notif.loading")} />
      ) : error ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">{error}</div>
      ) : items.length === 0 ? (
        <EmptyState title={t("notif.empty")} description={t("notif.title")} />
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow transition-shadow gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onItem(n)}
              >
                {/* t accepte un sur-ensemble de clés ; notificationText n'invoque t() qu'avec des clés notif.* existantes → cast sûr. */}
                <strong className={`text-foreground ${n.readAt ? 'font-medium' : 'font-bold'}`}>
                  {notificationText(n, t as (key: string) => string, isEn)}
                </strong>
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  {new Date(n.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                  {!n.readAt && <span className="w-2 h-2 rounded-full bg-primary inline-block" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
