# Invitations (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'UI d'invitation de membres (gestion + acceptation publique) au-dessus du backend `/organizer/invitations` + `/auth/accept-invitation` déjà existant.

**Architecture:** Couche données typée (`lib/invitations.ts`) au-dessus de `apiFetch`. Page de gestion `/dashboard/team` (couche dashboard `vp-*` + primitives `@/components/ui`). Page publique `/accept-invitation/[token]` (server component qui lit le token + child client, comme `/e/[slug]`), couche `vp-*` auth. Intégrations: item sidebar + lien depuis `admin/users`. Vérification finale e2e Playwright.

**Tech Stack:** Next.js 15 (App Router, React 19), Tailwind v4 (tokens SSOT), primitives shadcn vendored, `apiFetch`, i18n maison (`lib/i18n.ts`), Playwright.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true` — aucun `undefined` implicite sur prop optionnelle (utiliser `string | undefined` si une valeur potentiellement absente est passée).
- ZERO fake data, ZERO contrôle décoratif : toute donnée via `apiFetch`, toute action câblée à un vrai endpoint.
- Aucune string métier en dur dans les composants : tout via `t("…")`, clés ajoutées en **fr ET en** dans `lib/i18n.ts` (sinon `MessageKey` casse le typecheck).
- Ne PAS toucher au backend (`apps/api`) ni aux contrats.
- Couche publique = classes `vp-*` ; couche dashboard = `vp-*` scaffolding + primitives. Ne pas styliser d'éléments bruts à la main hors `vp-*`.
- Contrats backend (verbatim) : voir `docs/superpowers/specs/2026-06-21-invitations-frontend-design.md`.
- Vérif standard d'une tâche front (depuis `apps/web/`): `npx tsc --noEmit` (0 erreur) puis `npx eslint <fichiers>` (0 erreur).
- `apiFetch<T>(path, { method, body: JSON.stringify(...), headers })` ajoute déjà `Content-Type: application/json` et `credentials: "include"`. `ApiError` expose `.status:number`.
- Helpers auth: `getStoredToken()`, `setStoredToken(token)` depuis `../../lib/auth` (ajuster la profondeur relative selon le fichier).

---

### Task 1: Clés i18n

**Files:**
- Modify: `apps/web/lib/i18n.ts` (bloc `fr` et bloc `en` de `messages`)

**Interfaces:**
- Produces: nouvelles `MessageKey` consommées par les tâches 2–5 : `nav.team`, `invitations.*`, `accept.*`.

- [ ] **Step 1: Ajouter les clés FR** dans `messages.fr` (après `"nav.maintenance"` pour `nav.team`, et un bloc `invitations.*` / `accept.*` à la suite des clés existantes du bloc `fr`).

```ts
    "nav.team": "Équipe",
    "invitations.title": "Équipe",
    "invitations.subtitle": "Invitez des membres, suivez les invitations et gérez les accès de votre organisation.",
    "invitations.createTitle": "Inviter un membre",
    "invitations.emailLabel": "Adresse e-mail",
    "invitations.roleLabel": "Rôle",
    "invitations.roleOwner": "Propriétaire",
    "invitations.roleStaff": "Membre",
    "invitations.roleHelp": "Propriétaire : gère l'équipe et la facturation. Membre : accès opérationnel sans gestion de l'équipe.",
    "invitations.submit": "Créer l'invitation",
    "invitations.creating": "Création…",
    "invitations.linkTitle": "Lien d'invitation",
    "invitations.linkWarning": "Ce lien n'est affiché qu'une seule fois. Copiez-le et transmettez-le à la personne invitée (WhatsApp, SMS, e-mail…).",
    "invitations.copy": "Copier le lien",
    "invitations.copied": "Copié ✓",
    "invitations.copyFailed": "Copie impossible — sélectionnez le lien manuellement.",
    "invitations.close": "Fermer",
    "invitations.loading": "Chargement des invitations…",
    "invitations.loadError": "Chargement des invitations impossible.",
    "invitations.emptyTitle": "Aucune invitation",
    "invitations.emptyDesc": "Invitez un premier membre à l'aide du formulaire ci-dessus.",
    "invitations.statusPending": "En attente",
    "invitations.statusAccepted": "Acceptée",
    "invitations.statusRevoked": "Révoquée",
    "invitations.statusExpired": "Expirée",
    "invitations.expiresAt": "Expire le",
    "invitations.acceptedAt": "Acceptée le",
    "invitations.revoke": "Révoquer",
    "invitations.revokeTitle": "Révoquer l'invitation ?",
    "invitations.revokeDesc": "La personne ne pourra plus utiliser ce lien. Cette action est définitive.",
    "invitations.revokeConfirm": "Révoquer",
    "invitations.cancel": "Annuler",
    "invitations.createError": "Création de l'invitation impossible.",
    "invitations.conflict": "Cette adresse est déjà membre de l'organisation.",
    "accept.title": "Rejoindre l'organisation",
    "accept.lead": "Vous avez été invité·e. Définissez un mot de passe pour activer votre accès.",
    "accept.passwordLabel": "Mot de passe",
    "accept.confirmLabel": "Confirmer le mot de passe",
    "accept.submit": "Activer mon accès",
    "accept.submitting": "Activation…",
    "accept.passwordTooShort": "8 caractères minimum.",
    "accept.passwordMismatch": "Les mots de passe ne correspondent pas.",
    "accept.required": "Ce champ est requis.",
    "accept.invalid": "Invitation invalide ou expirée.",
    "accept.alreadyMember": "Vous êtes déjà membre de cette organisation.",
    "accept.throttled": "Trop de tentatives. Réessayez dans un instant.",
    "accept.fallbackError": "Activation impossible. Réessayez.",
    "accept.backToLogin": "Aller à la connexion",
```

- [ ] **Step 2: Ajouter les MÊMES clés en EN** dans `messages.en` (mêmes clés, valeurs anglaises).

```ts
    "nav.team": "Team",
    "invitations.title": "Team",
    "invitations.subtitle": "Invite members, track invitations and manage your organization's access.",
    "invitations.createTitle": "Invite a member",
    "invitations.emailLabel": "Email address",
    "invitations.roleLabel": "Role",
    "invitations.roleOwner": "Owner",
    "invitations.roleStaff": "Member",
    "invitations.roleHelp": "Owner: manages team and billing. Member: operational access without team management.",
    "invitations.submit": "Create invitation",
    "invitations.creating": "Creating…",
    "invitations.linkTitle": "Invitation link",
    "invitations.linkWarning": "This link is shown only once. Copy it and send it to the invited person (WhatsApp, SMS, email…).",
    "invitations.copy": "Copy link",
    "invitations.copied": "Copied ✓",
    "invitations.copyFailed": "Copy failed — select the link manually.",
    "invitations.close": "Close",
    "invitations.loading": "Loading invitations…",
    "invitations.loadError": "Unable to load invitations.",
    "invitations.emptyTitle": "No invitations",
    "invitations.emptyDesc": "Invite your first member using the form above.",
    "invitations.statusPending": "Pending",
    "invitations.statusAccepted": "Accepted",
    "invitations.statusRevoked": "Revoked",
    "invitations.statusExpired": "Expired",
    "invitations.expiresAt": "Expires",
    "invitations.acceptedAt": "Accepted",
    "invitations.revoke": "Revoke",
    "invitations.revokeTitle": "Revoke invitation?",
    "invitations.revokeDesc": "The person will no longer be able to use this link. This action is permanent.",
    "invitations.revokeConfirm": "Revoke",
    "invitations.cancel": "Cancel",
    "invitations.createError": "Unable to create the invitation.",
    "invitations.conflict": "This address is already a member of the organization.",
    "accept.title": "Join the organization",
    "accept.lead": "You've been invited. Set a password to activate your access.",
    "accept.passwordLabel": "Password",
    "accept.confirmLabel": "Confirm password",
    "accept.submit": "Activate my access",
    "accept.submitting": "Activating…",
    "accept.passwordTooShort": "Minimum 8 characters.",
    "accept.passwordMismatch": "Passwords do not match.",
    "accept.required": "This field is required.",
    "accept.invalid": "Invalid or expired invitation.",
    "accept.alreadyMember": "You are already a member of this organization.",
    "accept.throttled": "Too many attempts. Try again shortly.",
    "accept.fallbackError": "Activation failed. Please try again.",
    "accept.backToLogin": "Go to sign in",
```

- [ ] **Step 3: Vérifier le typecheck** (depuis `apps/web/`)

Run: `npx tsc --noEmit`
Expected: PASS (0 erreur) — confirme que les blocs fr/en restent symétriques.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n.ts
git commit -m "feat(web): i18n keys for invitations + accept flow"
```

---

### Task 2: Couche données `lib/invitations.ts`

**Files:**
- Create: `apps/web/lib/invitations.ts`

**Interfaces:**
- Consumes: `apiFetch` depuis `./api`.
- Produces:
  - types `InvitationStatus`, `InvitationRole`, `Invitation`, `CreatedInvitation`
  - `listInvitations(token: string): Promise<{ items: Invitation[] }>`
  - `createInvitation(token: string, input: { email: string; role: InvitationRole }): Promise<CreatedInvitation>`
  - `revokeInvitation(token: string, id: string): Promise<{ id: string; status: "REVOKED" }>`
  - `acceptInvitation(input: { token: string; password: string }): Promise<{ accessToken: string }>`
  - `buildAcceptUrl(rawToken: string): string`

- [ ] **Step 1: Créer le fichier**

```ts
import { apiFetch } from "./api";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type InvitationRole = "ORGANIZER_OWNER" | "ORGANIZER_STAFF";

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type CreatedInvitation = {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function listInvitations(token: string) {
  return apiFetch<{ items: Invitation[] }>("/organizer/invitations", {
    headers: authHeaders(token)
  });
}

export function createInvitation(token: string, input: { email: string; role: InvitationRole }) {
  return apiFetch<CreatedInvitation>("/organizer/invitations", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function revokeInvitation(token: string, id: string) {
  return apiFetch<{ id: string; status: "REVOKED" }>(`/organizer/invitations/${id}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
}

// Publique : pas d'en-tête d'auth, le serveur pose le cookie refresh.
export function acceptInvitation(input: { token: string; password: string }) {
  return apiFetch<{ accessToken: string }>("/auth/accept-invitation", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// Lien transmis « out-of-band » à l'invité·e (le backend n'envoie pas d'email).
export function buildAcceptUrl(rawToken: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/accept-invitation/${rawToken}`;
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 erreur).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/invitations.ts
git commit -m "feat(web): invitations API client layer"
```

---

### Task 3: Page publique d'acceptation `/accept-invitation/[token]`

**Files:**
- Create: `apps/web/app/accept-invitation/[token]/page.tsx` (server component)
- Create: `apps/web/app/accept-invitation/[token]/AcceptInvitationClient.tsx` (client)

**Interfaces:**
- Consumes: `acceptInvitation` (Task 2), `setStoredToken` (`lib/auth`), `useI18n` (`lib/i18n-provider`), clés `accept.*` (Task 1), primitives `Button`/`Input`/`FormError`.
- Produces: route `/accept-invitation/<token>`.

- [ ] **Step 1: Créer le server component** (`page.tsx`) — lit le token, `noindex`.

```tsx
import type { Metadata } from "next";
import { AcceptInvitationClient } from "./AcceptInvitationClient";

export const metadata: Metadata = {
  title: "Rejoindre l'organisation · VotezPro",
  robots: { index: false, follow: false }
};

type PageProps = { params: Promise<{ token: string }> };

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <main className="vp-auth-shell">
      <section className="vp-auth-stage">
        <div className="vp-auth-card">
          <AcceptInvitationClient token={token} />
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Créer le client component** (`AcceptInvitationClient.tsx`)

```tsx
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { acceptInvitation } from "../../../lib/invitations";
import { ApiError } from "../../../lib/api";
import { setStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Input, FormError } from "@/components/ui";

type FieldErrors = { password?: string | undefined; confirm?: string | undefined };

export function AcceptInvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (password.length < 8) next.password = t("accept.passwordTooShort");
    if (confirm !== password) next.confirm = t("accept.passwordMismatch");
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const errors = validate();
    if (errors.password || errors.confirm) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const result = await acceptInvitation({ token, password });
      setStoredToken(result.accessToken);
      router.push("/dashboard");
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409) {
        setError(t("accept.alreadyMember"));
      } else if (caughtError instanceof ApiError && caughtError.status === 429) {
        setError(t("accept.throttled"));
      } else if (caughtError instanceof ApiError && caughtError.status === 401) {
        setError(t("accept.invalid"));
      } else {
        setError(caughtError instanceof Error ? caughtError.message : t("accept.fallbackError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <span className="vp-eyebrow-pill">{t("accept.title")}</span>
      <h1>{t("accept.title")}</h1>
      <p className="vp-auth-card-lead">{t("accept.lead")}</p>
      <form onSubmit={onSubmit} className="vp-form" noValidate>
        <div className="vp-password-field">
          <Input
            id="password"
            label={t("accept.passwordLabel")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            state={fieldErrors.password ? "error" : "default"}
            errorText={fieldErrors.password}
            required
          />
          <button
            type="button"
            className="vp-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <Input
          id="confirm"
          label={t("accept.confirmLabel")}
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          state={fieldErrors.confirm ? "error" : "default"}
          errorText={fieldErrors.confirm}
          required
        />
        <FormError>{error}</FormError>
        <Button type="submit" loading={isLoading}>
          {isLoading ? t("accept.submitting") : t("accept.submit")}
        </Button>
      </form>
      <div className="vp-auth-card-foot">
        <Link href="/login">{t("accept.backToLogin")} <span aria-hidden="true">→</span></Link>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Vérifier typecheck + build de la route**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS ; la route `ƒ /accept-invitation/[token]` apparaît dans la sortie du build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/accept-invitation
git commit -m "feat(web): public accept-invitation page"
```

---

### Task 4: Page de gestion `/dashboard/team`

**Files:**
- Create: `apps/web/app/dashboard/team/page.tsx` (client component)

**Interfaces:**
- Consumes: `listInvitations`, `createInvitation`, `revokeInvitation`, `buildAcceptUrl`, types `Invitation`/`InvitationStatus`/`InvitationRole` (Task 2) ; `getStoredToken` ; `useI18n` ; primitives `Input`/`Button`/`StatusChip`/`EmptyState`/`LoadingState`/`ConfirmDialog` ; `ApiError`.
- Produces: route `/dashboard/team`.

- [ ] **Step 1: Créer la page**

```tsx
"use client";

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

  const canManage = useMemo(() => role === "ORGANIZER_OWNER" || role === "PLATFORM_ADMIN", [role]);

  const reload = async (token: string) => {
    const response = await listInvitations(token);
    setItems(response.items);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
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
      router.push("/login");
      return;
    }
    setIsCreating(true);
    try {
      const created = await createInvitation(token, { email, role: inviteRole });
      setCreatedLink(buildAcceptUrl(created.token));
      setEmail("");
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
      router.push("/login");
      return;
    }
    try {
      await revokeInvitation(token, id);
      await reload(token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t("invitations.createError"));
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
    <section>
      <header className="vp-block-head">
        <div>
          <span className="vp-eyebrow">{isEn ? "Organization" : "Organisation"}</span>
          <h2 className="vp-block-title">{t("invitations.title")}</h2>
          <p className="vp-muted">{t("invitations.subtitle")}</p>
        </div>
      </header>

      {canManage ? (
        <form className="vp-filter-bar vp-form" onSubmit={onCreate}>
          <Input
            id="invite-email"
            label={t("invitations.emailLabel")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            state={emailError ? "error" : "default"}
            errorText={emailError}
            helpText={t("invitations.roleHelp")}
            required
          />
          <label>
            {t("invitations.roleLabel")}
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InvitationRole)}>
              <option value="ORGANIZER_STAFF">{t("invitations.roleStaff")}</option>
              <option value="ORGANIZER_OWNER">{t("invitations.roleOwner")}</option>
            </select>
          </label>
          <Button type="submit" loading={isCreating}>
            {isCreating ? t("invitations.creating") : t("invitations.submit")}
          </Button>
        </form>
      ) : null}

      {createdLink ? (
        <section className="vp-invite-link" role="status" aria-live="polite">
          <strong>{t("invitations.linkTitle")}</strong>
          <p className="vp-muted">{t("invitations.linkWarning")}</p>
          <input className="vp-invite-link-field" readOnly value={createdLink} onFocus={(e) => e.target.select()} />
          <div className="vp-inline">
            <Button type="button" variant="secondary" onClick={() => void onCopy()}>
              {copied ? t("invitations.copied") : t("invitations.copy")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreatedLink(null)}>
              {t("invitations.close")}
            </Button>
          </div>
          {copyFailed ? <p className="vp-error">{t("invitations.copyFailed")}</p> : null}
        </section>
      ) : null}

      {error ? <p className="vp-error" role="alert">{error}</p> : null}

      {isLoading ? (
        <LoadingState variant="rows" count={4} label={t("invitations.loading")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("invitations.emptyTitle")} description={t("invitations.emptyDesc")} />
      ) : (
        <ul className="vp-event-rows">
          {items.map((invitation) => (
            <li key={invitation.id}>
              <div className="vp-event-row-meta">
                <StatusChip label={statusLabel(invitation.status)} tone={STATUS_TONE[invitation.status]} />
                <strong>{invitation.email}</strong>
                <span>
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
    </section>
  );
}
```

- [ ] **Step 2: Ajouter les styles `vp-invite-link`** dans `apps/web/app/globals.css` (après le bloc `.vp-load-more` ajouté précédemment). Tokens uniquement.

```css
/* Panneau lien d'invitation à usage unique. */
.vp-invite-link {
  display: grid;
  gap: 10px;
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--vp-line);
  border-radius: 12px;
  background: var(--color-muted);
}
.vp-invite-link-field {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--vp-line);
  border-radius: 8px;
  background: var(--color-card);
  font-family: var(--vp-font-mono);
  font-size: 13px;
  color: var(--vp-ink);
}
```

- [ ] **Step 3: Vérifier typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: PASS ; route `○ /dashboard/team` listée.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/team apps/web/app/globals.css
git commit -m "feat(web): team invitations management page"
```

---

### Task 5: Intégration (sidebar + bouton admin/users)

**Files:**
- Modify: `apps/web/components/dashboard-sidebar.tsx` (tableau `navItems`, imports d'icônes)
- Modify: `apps/web/app/dashboard/admin/users/page.tsx` (header de page : ajouter le lien « Inviter »)

**Interfaces:**
- Consumes: route `/dashboard/team` (Task 4), clé `nav.team` (Task 1).

- [ ] **Step 1: Ajouter l'item sidebar.** Dans `dashboard-sidebar.tsx`, importer `UserPlus` depuis `lucide-react` (l'ajouter à la liste d'imports existante) et insérer dans `navItems` après l'item `/dashboard/admin/users` :

```ts
    { href: "/dashboard/team", label: t("nav.team"), icon: UserPlus },
```

- [ ] **Step 2: Re-câbler le bouton « Inviter ».** Dans `app/dashboard/admin/users/page.tsx`, ajouter en haut l'import `Link` :

```ts
import Link from "next/link";
```

et, dans le `<header className="vp-block-head">`, ajouter à droite du titre un lien stylé bouton :

```tsx
          <Link href="/dashboard/team" className="vp-link-secondary">
            {isEn ? "Invite a member →" : "Inviter un membre →"}
          </Link>
```

(le placer dans le `<div>` du header, sous le `<p className="vp-muted">`).

- [ ] **Step 3: Vérifier typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint components/dashboard-sidebar.tsx app/dashboard/admin/users/page.tsx && npx next build`
Expected: PASS ; l'item « Équipe » apparaît dans la sidebar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/dashboard-sidebar.tsx apps/web/app/dashboard/admin/users/page.tsx
git commit -m "feat(web): wire team page into sidebar + admin users"
```

---

### Task 6: Test e2e Playwright + vérification finale

**Files:**
- Create: `apps/web/tests/e2e/invitations.spec.ts`

**Interfaces:**
- Consumes: les routes `/dashboard/team` et `/accept-invitation/[token]` (Tasks 3–4). S'appuie sur le harnais e2e existant (un OWNER seedé + login). Respecter les gotchas: `E2E_API_BASE_URL=:3011`, browsers headless-shell.

- [ ] **Step 1: Lire un spec e2e existant** pour réutiliser le pattern de login/seed.

Run: `sed -n '1,40p' apps/web/tests/e2e/public-event.spec.ts`
Expected: comprendre les helpers de connexion/seed et l'usage de `E2E_API_BASE_URL`.

- [ ] **Step 2: Écrire le test e2e** (`invitations.spec.ts`) — calqué sur le harnais du spec lu à l'étape 1. Squelette à compléter avec les helpers réels :

```ts
import { test, expect } from "@playwright/test";
// Réutiliser le(s) helper(s) de login OWNER du harnais e2e existant.

test.describe("Invitations", () => {
  test("OWNER crée une invitation, voit le lien, révoque", async ({ page }) => {
    // 1. Se connecter en OWNER (helper existant) → aller sur /dashboard/team
    await page.goto("/dashboard/team");
    // 2. Remplir email + rôle, soumettre
    await page.getByLabel(/e-mail|email/i).fill(`invitee-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /créer l'invitation|create invitation/i }).click();
    // 3. Le panneau lien à usage unique s'affiche avec une URL /accept-invitation/
    const link = page.locator(".vp-invite-link-field");
    await expect(link).toBeVisible();
    await expect(link).toHaveValue(/\/accept-invitation\//);
    // 4. L'invitation apparaît PENDING dans la liste
    await expect(page.locator(".vp-event-rows")).toContainText(/en attente|pending/i);
    // 5. Révoquer → confirmer → statut REVOKED
    await page.getByRole("button", { name: /révoquer|revoke/i }).first().click();
    await page.getByRole("button", { name: /révoquer|revoke/i }).last().click();
    await expect(page.locator(".vp-event-rows")).toContainText(/révoquée|revoked/i);
  });

  test("Token invalide → message d'erreur", async ({ page }) => {
    await page.goto("/accept-invitation/invalidtoken00000000000000000000000000000000");
    await page.getByLabel(/mot de passe|password/i).first().fill("password123");
    await page.getByLabel(/confirmer|confirm/i).fill("password123");
    await page.getByRole("button", { name: /activer|activate/i }).click();
    await expect(page.getByRole("alert")).toContainText(/invalide|invalid|expir/i);
  });
});
```

- [ ] **Step 3: Lancer les e2e**

Run (depuis `apps/web/`): `E2E_API_BASE_URL=http://localhost:3011/api/v1 npx playwright test invitations`
Expected: PASS (2 tests). Si le harnais exige un démarrage API/seed, suivre le même `webServer`/setup que les specs existants.

- [ ] **Step 4: Vérification finale complète**

Run (depuis `apps/web/`): `npx tsc --noEmit && npx eslint . && npx next build`
Expected: 0 erreur TS, 0 erreur lint, build prod exit 0 (routes `/dashboard/team` et `/accept-invitation/[token]` présentes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/invitations.spec.ts
git commit -m "test(web): e2e for invitations create/revoke + accept"
```

---

## Self-Review

**Spec coverage:**
- Couche données `lib/invitations.ts` → Task 2 ✅
- Page gestion `/dashboard/team` (form, panneau lien usage-unique, liste, révoquer, états, gating OWNER/STAFF) → Task 4 ✅
- Page publique `/accept-invitation/[token]` (password+confirm, toggle, erreurs 401/409/429, noindex) → Task 3 ✅
- Intégration sidebar + bouton admin/users → Task 5 ✅
- i18n fr+en → Task 1 ✅
- Mapping statuts → ton (Task 4 `STATUS_TONE`, conforme au tableau de la spec) ✅
- Tests e2e (create→lien→revoke + accept + token invalide) → Task 6 ✅
- Hors-scope (email, preview, resend) → non implémentés, conforme ✅

**Placeholder scan:** le seul squelette à compléter est le helper de login/seed du test e2e (Task 6, Step 1–2) — explicitement délégué au harnais existant car ses helpers ne sont pas réécrits ici ; tout le reste contient le code complet.

**Type consistency:** `InvitationStatus`/`InvitationRole`/`Invitation`/`CreatedInvitation` définis en Task 2 et réutilisés à l'identique en Tasks 3–4. `STATUS_TONE` couvre les 4 valeurs de `InvitationStatus`. Props `ConfirmDialog` (trigger/title/description/confirmLabel/cancelLabel/onConfirm) conformes au composant réel. `Input` props (`state`/`errorText`/`helpText`/`label`) conformes à `InputProps`. `Button` props (`variant`/`loading`) conformes.
