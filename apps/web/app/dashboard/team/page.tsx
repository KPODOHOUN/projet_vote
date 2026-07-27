"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { canManageTeam } from "@/lib/roles";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import {
  listInvitations,
  createInvitation,
  revokeInvitation,
  buildAcceptUrl,
  type Invitation,
  type InvitationStatus,
  type InvitationRole
} from "../../../lib/invitations";
import { showToast } from "../../../lib/toast";
import {
  Button,
  Input,
  StatusChip,
  EmptyState,
  LoadingState,
  ConfirmDialog
} from "@/components/ui";

type MeResponse = { role: string };

const STATUS_TONE: Record<InvitationStatus, "pending" | "success" | "muted" | "error"> = {
  PENDING: "pending",
  ACCEPTED: "success",
  REVOKED: "muted",
  EXPIRED: "error"
};

export default function DashboardTeamPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const [role, setRole] = useState<string>("");
  const [items, setItems] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitationRole>("ORGANIZER_STAFF");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const canManage = useMemo(() => canManageTeam(role), [role]);

  const reload = async (token: string) => {
    const response = await listInvitations(token);
    setItems(response.items);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setIsLoading(true);
    setError("");
    void (async () => {
      try {
        const me = await apiFetch<MeResponse>("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        setRole(me.role);
        await reload(token);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : t("invitations.loadError"));
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setEmailError(undefined);
    setCreatedLink(null);
    setCopied(false);
    setCopyFailed(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t("login.invalidEmail"));
      return;
    }
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setIsCreating(true);
    try {
      const created = await createInvitation(token, { email, role: inviteRole });
      setCreatedLink(buildAcceptUrl(created.token));
      setEmail("");
      showToast.success(t("invitations.linkTitle"));
      await reload(token);
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409) {
        setError(t("invitations.conflict"));
      } else {
        setError(caughtError instanceof Error ? caughtError.message : t("invitations.createError"));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const onRevoke = async (id: string) => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    try {
      await revokeInvitation(token, id);
      await reload(token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t("invitations.revokeError"));
    }
  };

  const onCopy = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyFailed(true);
    }
  };

  const statusLabel = (status: InvitationStatus) =>
    ({
      PENDING: t("invitations.statusPending"),
      ACCEPTED: t("invitations.statusAccepted"),
      REVOKED: t("invitations.statusRevoked"),
      EXPIRED: t("invitations.statusExpired")
    })[status];

  const roleLabel = (r: string) =>
    r === "ORGANIZER_OWNER" ? t("invitations.roleOwner") : t("invitations.roleStaff");

  return (
    <div className="space-y-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-6">
        <div className="space-y-1">
          <span className="text-sm font-bold tracking-widest uppercase text-primary block">
            {t("invitations.eyebrow")}
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            {t("invitations.title")}
          </h2>
          <p className="text-muted-foreground">{t("invitations.subtitle")}</p>
        </div>
      </header>

      {canManage ? (
        <form className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-card p-6 rounded-xl border border-border shadow-sm" onSubmit={onCreate}>
          <div className="md:col-span-5">
            <Input
              id="invite-email"
              label={t("invitations.emailLabel")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              state={emailError ? "error" : "default"}
              errorText={emailError}
              required
            />
          </div>
          <div className="md:col-span-4 grid gap-1.5">
            <label className="text-sm font-medium leading-none">
              {t("invitations.roleLabel")}
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InvitationRole)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="ORGANIZER_STAFF" className="bg-background">{t("invitations.roleStaff")}</option>
              <option value="ORGANIZER_OWNER" className="bg-background">{t("invitations.roleOwner")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("invitations.roleHelp")}</p>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" loading={isCreating} className="w-full">
              {isCreating ? t("invitations.creating") : t("invitations.submit")}
            </Button>
          </div>
        </form>
      ) : null}

      {createdLink ? (
        <section className="p-6 rounded-xl border border-primary/30 bg-primary/5 space-y-4" role="status" aria-live="polite">
          <strong className="text-lg font-bold text-foreground block">{t("invitations.linkTitle")}</strong>
          <p className="text-sm text-muted-foreground">{t("invitations.linkWarning")}</p>
          <input className="vp-invite-link-field flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm font-mono text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" readOnly value={createdLink} onFocus={(e) => e.target.select()} />
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void onCopy()}>
              {copied ? t("invitations.copied") : t("invitations.copy")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreatedLink(null)}>
              {t("invitations.close")}
            </Button>
          </div>
          {copyFailed ? <p className="text-sm font-medium text-destructive">{t("invitations.copyFailed")}</p> : null}
        </section>
      ) : null}

      {error ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState variant="rows" count={4} label={t("invitations.loading")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("invitations.emptyTitle")} description={t("invitations.emptyDesc")} />
      ) : (
        <ul className="vp-event-rows space-y-3">
          {items.map((invitation) => (
            <li key={invitation.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow transition-shadow gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <StatusChip label={statusLabel(invitation.status)} tone={STATUS_TONE[invitation.status]} />
                <strong className="text-foreground">{invitation.email}</strong>
                <span className="text-sm text-muted-foreground">
                  {roleLabel(invitation.role)} ·{" "}
                  {invitation.status === "ACCEPTED" && invitation.acceptedAt
                    ? `${t("invitations.acceptedAt")} ${new Date(invitation.acceptedAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}`
                    : `${t("invitations.expiresAt")} ${new Date(invitation.expiresAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}`}
                </span>
              </div>
              {canManage && invitation.status === "PENDING" ? (
                <ConfirmDialog
                  trigger={<Button type="button" variant="ghost">{t("invitations.revoke")}</Button>}
                  title={t("invitations.revokeTitle")}
                  description={t("invitations.revokeDesc")}
                  confirmLabel={t("invitations.revokeConfirm")}
                  cancelLabel={t("invitations.cancel")}
                  onConfirm={() => void onRevoke(invitation.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
