"use client";

import Link from "next/link";
import { authLoginUrl } from "@/lib/auth-navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { updateAdminUser, type AdminUser, type AdminUsersResponse } from "@/lib/admin-users";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  KpiCard,
  LoadingState,
  StatusChip
} from "@/components/ui";
import {
  AdminDataTable,
  AdminErrorAlert,
  AdminFilterCard,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh
} from "@/components/admin/admin-shell";

const ROLE_TONE: Record<string, "warning" | "active" | "muted" | "error"> = {
  PLATFORM_ADMIN: "warning",
  PLATFORM_SUPER_ADMIN: "warning",
  ORGANIZER_OWNER: "active",
  ORGANIZER_STAFF: "muted"
};

const ASSIGNABLE_ROLES = [
  "ORGANIZER_STAFF",
  "ORGANIZER_OWNER",
  "PLATFORM_ADMIN",
  "PLATFORM_SUPER_ADMIN"
] as const;

export default function AdminUsersPage() {
  const router = useRouter();
  const { user: me, role: myRole } = useAuth();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [limit, setLimit] = useState(25);
  const [roleFilter, setRoleFilter] = useState("");
  const [email, setEmail] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const buildQuery = (cursor?: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    if (roleFilter) params.set("role", roleFilter);
    if (email.trim()) params.set("email", email.trim());
    return params.toString();
  };

  const loadUsers = async (cursor?: string) => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const response = await apiFetch<AdminUsersResponse>(`/admin/users?${buildQuery(cursor)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setNextCursor(response.nextCursor);
    setUsers((prev) => (cursor ? [...prev, ...response.items] : response.items));
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setError("");
    setIsLoading(true);
    void loadUsers()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, roleFilter, email, router]);

  const onRoleChange = async (userId: string, nextRole: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyUserId(userId);
    try {
      await updateAdminUser(token, userId, { role: nextRole });
      showToast.success(isEn ? "Role updated." : "Rôle mis à jour.");
      await loadUsers();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Update failed." : "Échec.");
    } finally {
      setBusyUserId(null);
    }
  };

  const onSuspend = async (userId: string, reason?: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyUserId(userId);
    try {
      await updateAdminUser(token, userId, {
        suspended: true,
        ...(reason?.trim() ? { suspendedReason: reason.trim() } : {})
      });
      showToast.success(isEn ? "Account suspended." : "Compte suspendu.");
      await loadUsers();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Suspend failed." : "Échec.");
    } finally {
      setBusyUserId(null);
    }
  };

  const onUnsuspend = async (userId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyUserId(userId);
    try {
      await updateAdminUser(token, userId, { suspended: false });
      showToast.success(isEn ? "Account reactivated." : "Compte réactivé.");
      await loadUsers();
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Reactivate failed." : "Échec.");
    } finally {
      setBusyUserId(null);
    }
  };

  const platformAdmins = users.filter((u) => u.role === "PLATFORM_ADMIN" || u.role === "PLATFORM_SUPER_ADMIN").length;
  const suspendedCount = users.filter((u) => u.suspendedAt).length;

  const canAssignSuperAdmin = myRole === "PLATFORM_SUPER_ADMIN";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Platform" : "Plateforme"}
        title={isEn ? "User management" : "Gestion des utilisateurs"}
        description={
          isEn
            ? "Change roles and suspend accounts. Suspended users cannot sign in and active sessions are revoked."
            : "Modifiez les rôles et suspendez des comptes. Les utilisateurs suspendus ne peuvent plus se connecter et leurs sessions sont révoquées."
        }
      />

      <AdminFilterCard>
        <Input
          id="limit"
          label={isEn ? "Page size" : "Taille de page"}
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <AdminSelect
          id="roleFilter"
          label={isEn ? "Role filter" : "Filtre rôle"}
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "", label: isEn ? "All roles" : "Tous les rôles" },
            ...ASSIGNABLE_ROLES.map((r) => ({ value: r, label: r }))
          ]}
        />
        <Input
          id="email"
          label={isEn ? "Email search" : "Recherche email"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={isEn ? "organisateur@…" : "organisateur@…"}
        />
      </AdminFilterCard>

      {isLoading ? (
        <LoadingState variant="rows" count={5} label={isEn ? "Loading users…" : "Chargement…"} />
      ) : error ? (
        <AdminErrorAlert message={error} />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <KpiCard label={isEn ? "Shown" : "Affichés"} value={String(users.length)} />
            <KpiCard label={isEn ? "Platform admins" : "Admins plateforme"} value={String(platformAdmins)} />
            <KpiCard label={isEn ? "Suspended" : "Suspendus"} value={String(suspendedCount)} />
          </section>

          {users.length === 0 ? (
            <EmptyState
              title={isEn ? "No users" : "Aucun utilisateur"}
              description={isEn ? "Adjust filters." : "Ajustez les filtres."}
            />
          ) : (
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>{isEn ? "User" : "Utilisateur"}</AdminTh>
                  <AdminTh>{isEn ? "Role" : "Rôle"}</AdminTh>
                  <AdminTh>{isEn ? "Status" : "Statut"}</AdminTh>
                  <AdminTh>{isEn ? "Actions" : "Actions"}</AdminTh>
                </tr>
              </AdminTableHead>
              <tbody>
                {users.map((userItem) => {
                    const isSelf = userItem.id === me?.userId;
                    const isSuspended = Boolean(userItem.suspendedAt);
                    const rolesForRow = ASSIGNABLE_ROLES.filter(
                      (r) => r !== "PLATFORM_SUPER_ADMIN" || canAssignSuperAdmin
                    );
                    return (
                      <AdminTableRow key={userItem.id}>
                        <AdminTd>
                          <Link href={`/admin/users/${userItem.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                            {userItem.email}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {userItem.tenantId.slice(0, 12)}… ·{" "}
                            {new Date(userItem.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                          </p>
                        </AdminTd>
                        <AdminTd>
                          {isSelf ? (
                            <StatusChip label={userItem.role} tone={ROLE_TONE[userItem.role] ?? "muted"} />
                          ) : (
                            <select
                              value={userItem.role}
                              disabled={busyUserId === userItem.id || isSuspended}
                              onChange={(e) => void onRoleChange(userItem.id, e.target.value)}
                              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                              {rolesForRow.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          )}
                        </AdminTd>
                        <AdminTd>
                          {isSuspended ? (
                            <div className="space-y-1">
                              <StatusChip label={isEn ? "SUSPENDED" : "SUSPENDU"} tone="error" />
                              {userItem.suspendedReason ? (
                                <p className="max-w-xs text-xs text-muted-foreground">{userItem.suspendedReason}</p>
                              ) : null}
                            </div>
                          ) : (
                            <StatusChip label={isEn ? "ACTIVE" : "ACTIF"} tone="live" />
                          )}
                        </AdminTd>
                        <AdminTd>
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">{isEn ? "Your account" : "Votre compte"}</span>
                          ) : isSuspended ? (
                            <ConfirmDialog
                              title={isEn ? "Reactivate account?" : "Réactiver le compte ?"}
                              description={userItem.email}
                              confirmLabel={isEn ? "Reactivate" : "Réactiver"}
                              cancelLabel={isEn ? "Cancel" : "Annuler"}
                              destructive={false}
                              onConfirm={() => void onUnsuspend(userItem.id)}
                              trigger={
                                <Button type="button" size="sm" variant="secondary" disabled={busyUserId === userItem.id}>
                                  {isEn ? "Reactivate" : "Réactiver"}
                                </Button>
                              }
                            />
                          ) : (
                            <ConfirmDialog
                              title={isEn ? "Suspend account?" : "Suspendre le compte ?"}
                              description={
                                isEn
                                  ? `${userItem.email} will be signed out immediately and cannot log in.`
                                  : `${userItem.email} sera déconnecté immédiatement et ne pourra plus se connecter.`
                              }
                              confirmLabel={isEn ? "Suspend" : "Suspendre"}
                              cancelLabel={isEn ? "Cancel" : "Annuler"}
                              onConfirm={() => void onSuspend(userItem.id)}
                              trigger={
                                <Button type="button" size="sm" variant="destructive" disabled={busyUserId === userItem.id}>
                                  {isEn ? "Suspend" : "Suspendre"}
                                </Button>
                              }
                            />
                          )}
                        </AdminTd>
                      </AdminTableRow>
                    );
                  })}
                </tbody>
            </AdminDataTable>
          )}

          {nextCursor ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                loading={isLoadingMore}
                onClick={() => {
                  setIsLoadingMore(true);
                  void loadUsers(nextCursor).finally(() => setIsLoadingMore(false));
                }}
              >
                {isEn ? "Load more" : "Charger plus"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AdminPageShell>
  );
}
