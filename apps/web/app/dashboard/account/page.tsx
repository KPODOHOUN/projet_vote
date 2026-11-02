"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "../../../lib/api";
import { clearAuthStorage, getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import {
  getAccount, changePassword, changeEmail, listSessions, revokeOtherSessions, revokeSession,
  deviceLabel, deleteMyAccount, downloadPrivacyExport, type Account, type AccountSession
} from "../../../lib/account";
import { Button, Input, StatusChip, EmptyState, LoadingState, ConfirmDialog } from "@/components/ui";
import { PayoutDestinationPanel } from "../../../components/payout-destination-panel";
import { formatUserRole } from "../../../lib/i18n";
import { showToast } from "../../../lib/toast";

export default function DashboardAccountPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";

  const [account, setAccount] = useState<Account | null>(null);
  // Clés de paiement : seulement pour l'ancienne offre (paiement direct).
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // password form
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwFieldError, setPwFieldError] = useState<string | undefined>(undefined);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // email form
  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const doExport = async () => {
    const token = getStoredToken();
    if (!token) return;
    setExportBusy(true);
    try {
      await downloadPrivacyExport(token);
    } catch {
      showToast.error(t("account.data.exportFailed"));
    } finally {
      setExportBusy(false);
    }
  };

  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const doDelete = async () => {
    const token = getStoredToken();
    if (!token) return;
    setDeleteBusy(true);
    try {
      await deleteMyAccount(
        token,
        account?.hasPassword === false ? { confirmEmail: deleteConfirmation.trim() } : { currentPassword: deleteConfirmation }
      );
      clearAuthStorage();
      showToast.success(t("account.data.deleted"));
      router.push("/");
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : t("account.data.deleteFailed"));
    } finally {
      setDeleteBusy(false);
      setDeleteConfirmation("");
    }
  };

  const requireToken = () => {
    const token = getStoredToken();
    if (!token) router.push(authLoginUrl());
    return token;
  };

  const loadSessions = async (token: string) => {
    const res = await listSessions(token);
    setSessions(res.items);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { router.push(authLoginUrl()); return; }
    setIsLoading(true);
    setLoadError("");
    void (async () => {
      try {
        setAccount(await getAccount(token));
        await loadSessions(token);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("account.loadError"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPwError(""); setPwSuccess(false); setPwFieldError(undefined);
    if (pwNew.length < 8) { setPwFieldError(t("account.pwTooShort")); return; }
    if (pwNew !== pwConfirm) { setPwFieldError(t("account.pwMismatch")); return; }
    const token = requireToken(); if (!token) return;
    setPwBusy(true);
    try {
      await changePassword(token, { currentPassword: pwCurrent, newPassword: pwNew });
      setPwSuccess(true); setPwCurrent(""); setPwNew(""); setPwConfirm("");
      showToast.success(t("account.pwSuccess"));
      await loadSessions(token);
    } catch (e) {
      setPwError(e instanceof ApiError && e.status === 401 ? t("account.pwWrong") : e instanceof Error ? e.message : t("account.genericError"));
    } finally { setPwBusy(false); }
  };

  const onChangeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(""); setEmailSuccess(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setEmailError(t("account.emailInvalid")); return; }
    const token = requireToken(); if (!token) return;
    setEmailBusy(true);
    try {
      const res = await changeEmail(token, { newEmail, currentPassword: emailPw });
      clearAuthStorage();
      setEmailSuccess(true); setEmailPw("");
      showToast.success(t("account.emailSuccess"));
      router.push(`/check-email?email=${encodeURIComponent(res.email)}`);
    } catch (e) {
      setEmailError(
        e instanceof ApiError && e.status === 409 ? t("account.emailTaken")
        : e instanceof ApiError && e.status === 401 ? t("account.pwWrong")
        : e instanceof Error ? e.message : t("account.genericError")
      );
    } finally { setEmailBusy(false); }
  };

  const doRevoke = async (id: string) => {
    const token = requireToken(); if (!token) return;
    try { await revokeSession(token, id); await loadSessions(token); }
    catch (e) { setLoadError(e instanceof Error ? e.message : t("account.genericError")); }
  };

  const doRevokeOthers = async () => {
    const token = requireToken(); if (!token) return;
    try { await revokeOtherSessions(token); await loadSessions(token); }
    catch (e) { setLoadError(e instanceof Error ? e.message : t("account.genericError")); }
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div className="space-y-1">
          <span className="block text-sm font-semibold text-slate-600">{isEn ? "Account" : "Compte"}</span>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl text-foreground">{t("account.title")}</h1>
          <p className="text-muted-foreground">{t("account.subtitle")}</p>
        </div>
      </header>

      {isLoading ? (
        <LoadingState variant="rows" count={3} label={t("account.loading")} />
      ) : loadError ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">{loadError}</div>
      ) : (
        <div className="space-y-10">
          {/* Infos */}
          {account ? (
            <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("account.infoTitle")}</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                <div><dt className="text-sm text-muted-foreground mb-1">{t("account.email")}</dt><dd className="font-medium text-foreground">{account.email}</dd></div>
                <div><dt className="text-sm text-muted-foreground mb-1">{t("account.role")}</dt><dd className="font-medium text-foreground">{formatUserRole(account.role, isEn)}</dd></div>
                <div><dt className="text-sm text-muted-foreground mb-1">{t("account.org")}</dt><dd className="font-medium text-foreground">{account.tenant.displayName}</dd></div>
                <div><dt className="text-sm text-muted-foreground mb-1">{t("account.memberSince")}</dt><dd className="font-medium text-foreground">{new Date(account.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}</dd></div>
              </dl>
            </section>
          ) : null}

          {account?.role === "ORGANIZER_OWNER" ? <PayoutDestinationPanel /> : null}

          {/* Mot de passe */}
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("account.pwTitle")}</h3>
            <form className="space-y-4 max-w-md" onSubmit={onChangePassword} noValidate>
              <Input id="pw-current" label={t("account.pwCurrent")} type="password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
              <Input id="pw-new" label={t("account.pwNew")} type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} state={pwFieldError ? "error" : "default"} errorText={pwFieldError} required />
              <Input id="pw-confirm" label={t("account.pwConfirm")} type="password" autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
              {pwError ? <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium" role="alert">{pwError}</div> : null}
              {pwSuccess ? <div className="p-3 rounded-md bg-[var(--color-success)]/10 text-[var(--color-success)] text-sm font-medium" role="status">{t("account.pwSuccess")}</div> : null}
              <Button type="submit" loading={pwBusy}>{pwBusy ? t("account.pwSubmitting") : t("account.pwSubmit")}</Button>
            </form>
          </section>

          {/* Email */}
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">{t("account.emailTitle")}</h3>
            <form className="space-y-4 max-w-md" onSubmit={onChangeEmail} noValidate>
              <Input id="email-new" label={t("account.emailNew")} type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              <Input id="email-pw" label={t("account.emailPw")} type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} required />
              {emailError ? <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium" role="alert">{emailError}</div> : null}
              {emailSuccess ? <div className="p-3 rounded-md bg-[var(--color-success)]/10 text-[var(--color-success)] text-sm font-medium" role="status">{t("account.emailSuccess")}</div> : null}
              <Button type="submit" loading={emailBusy}>{emailBusy ? t("account.emailSubmitting") : t("account.emailSubmit")}</Button>
            </form>
          </section>

          {/* Sessions */}
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-xl font-bold tracking-tight text-foreground">{t("account.sessTitle")}</h3>
              {sessions.length > 1 ? (
                <ConfirmDialog
                  trigger={<Button type="button" variant="secondary">{t("account.sessRevokeOthers")}</Button>}
                  title={t("account.sessRevokeOthersTitle")}
                  description={t("account.sessRevokeOthersDesc")}
                  confirmLabel={t("account.sessRevokeOthers")}
                  cancelLabel={t("account.cancel")}
                  onConfirm={() => void doRevokeOthers()}
                />
              ) : null}
            </div>
            {sessions.length === 0 ? (
              <EmptyState title={t("account.sessTitle")} description={t("account.sessEmpty")} />
            ) : (
              <ul className="vp-event-rows space-y-3">
                {sessions.map((s) => (
                  <li key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow transition-shadow gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {s.current ? <StatusChip label={t("account.sessCurrent")} tone="active" /> : null}
                      <strong className="text-foreground">{deviceLabel(s.userAgent, t("account.sessUnknownDevice"))}</strong>
                      <span className="text-sm text-muted-foreground">
                        {s.ipAddress ?? "…"} · {t("account.sessCreated")} {new Date(s.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")} · {t("account.sessExpires")} {new Date(s.expiresAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                      </span>
                    </div>
                    {!s.current ? (
                      <ConfirmDialog
                        trigger={<Button type="button" variant="ghost">{t("account.sessRevoke")}</Button>}
                        title={t("account.sessRevokeTitle")}
                        description={t("account.sessRevokeDesc")}
                        confirmLabel={t("account.sessRevoke")}
                        cancelLabel={t("account.cancel")}
                        onConfirm={() => void doRevoke(s.id)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="account-data" className="space-y-3 border-t border-border pt-6">
            <h2 id="account-data" className="text-lg font-bold text-slate-900">{t("account.data.title")}</h2>
            <p className="text-sm text-slate-600">{t("account.data.exportDesc")}</p>
            <Button type="button" variant="secondary" loading={exportBusy} onClick={() => void doExport()}>
              {t("account.data.export")}
            </Button>
          </section>

          <section aria-labelledby="account-delete" className="space-y-3 rounded-md border border-destructive/30 p-5">
            <h2 id="account-delete" className="text-lg font-bold text-slate-900">{t("account.data.deleteTitle")}</h2>
            <p className="text-sm text-slate-600">{t("account.data.deleteDesc")}</p>
            <ConfirmDialog
              title={t("account.data.deleteTitle")}
              description={t("account.data.deleteConfirm")}
              confirmLabel={t("account.data.delete")}
              cancelLabel={t("account.data.keep")}
              confirmDisabled={deleteConfirmation.trim().length === 0 || deleteBusy}
              onOpenChange={(open) => {
                if (!open) setDeleteConfirmation("");
              }}
              onConfirm={() => void doDelete()}
              trigger={
                <Button type="button" variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                  {t("account.data.delete")}
                </Button>
              }
            >
              <Input
                id="delete-confirmation"
                label={account?.hasPassword === false ? t("account.data.deleteEmail") : t("account.data.deletePassword")}
                type={account?.hasPassword === false ? "email" : "password"}
                autoComplete={account?.hasPassword === false ? "email" : "current-password"}
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
              />
            </ConfirmDialog>
          </section>
        </div>
      )}
    </div>
  );
}
