"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, ConfirmDialog, Input, KpiCard, LoadingState, StatusChip } from "@/components/ui";
import { AdminPageHeader, AdminPageShell, AdminErrorAlert } from "@/components/admin/admin-shell";

type UserDetail = {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  tenant: { id: string; slug: string; displayName: string; provider: string | null; commissionBps: number | null };
  emailVerifiedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
  stats: { totalVotes: number; paidVotes: number; totalEvents: number; activeEvents: number; totalRevenueCfa: number };
  subscription: { id: string; planType: string; status: string; expiresAt: string; frozenCommissionBps: number } | null;
  sessions: { id: string; createdAt: string; expiresAt: string; revokedAt: string | null }[];
};

const PROVIDERS = ["FEEXPAY", "KKIAPAY", "FEDAPAY"] as const;

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const userId = params?.userId as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const [saving, setSaving] = useState("");

  const loadUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await apiFetch<UserDetail>(`/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(data);
      setProvider(data.tenant.provider ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { void loadUser(); }, [loadUser]);

  const updateProvider = async () => {
    const token = getStoredToken();
    if (!token || !provider) return;
    setSaving("provider");
    try {
      await apiFetch(`/admin/users/${userId}/provider`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      showToast.success(isEn ? "Provider updated." : "Fournisseur mis à jour.");
    } catch { showToast.error(isEn ? "Update failed." : "Échec de la mise à jour."); }
    finally { setSaving(""); }
  };

  const suspendUser = async () => {
    const token = getStoredToken();
    if (!token) return;
    setSaving("suspend");
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: true, suspendedReason: suspendReason || undefined })
      });
      showToast.success(isEn ? "User suspended." : "Utilisateur suspendu.");
      setShowSuspendConfirm(false);
      await loadUser();
    } catch { showToast.error(isEn ? "Suspension failed." : "Échec de la suspension."); }
    finally { setSaving(""); }
  };

  const unsuspendUser = async () => {
    const token = getStoredToken();
    if (!token) return;
    setSaving("unsuspend");
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: false })
      });
      showToast.success(isEn ? "User unsuspended." : "Utilisateur réactivé.");
      await loadUser();
    } catch { showToast.error(isEn ? "Reactivation failed." : "Échec de la réactivation."); }
    finally { setSaving(""); }
  };

  const deleteUser = async () => {
    const token = getStoredToken();
    if (!token) return;
    setSaving("delete");
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast.success(isEn ? "User deleted." : "Utilisateur supprimé.");
      setShowDeleteConfirm(false);
      router.replace("/admin/users");
    } catch { showToast.error(isEn ? "Deletion failed." : "Échec de la suppression."); }
    finally { setSaving(""); }
  };

  if (isLoading) return <LoadingState variant="kpi" count={4} label={isEn ? "Loading user…" : "Chargement de l'utilisateur…"} />;
  if (error) return <AdminErrorAlert message={error} />;
  if (!user) return null;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Users" : "Utilisateurs"}
        title={user.email}
        description={`${user.role} · ${user.tenant.displayName} (${user.tenant.slug})`}
        actions={
          <div className="flex items-center gap-3">
            <StatusChip variant={user.suspendedAt ? "error" : "active"}>
              {user.suspendedAt ? (isEn ? "Suspended" : "Suspendu") : (isEn ? "Active" : "Actif")}
            </StatusChip>
            <StatusChip variant="warning">{user.role}</StatusChip>
            {user.suspendedAt ? (
              <Button variant="secondary" onClick={unsuspendUser} loading={saving === "unsuspend"}>
                {isEn ? "Reactivate" : "Réactiver"}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setShowSuspendConfirm(true)}>
                {isEn ? "Suspend" : "Suspendre"}
              </Button>
            )}
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              {isEn ? "Delete" : "Supprimer"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
        <KpiCard label={isEn ? "Total votes" : "Votes totaux"} value={String(user.stats.totalVotes)} />
        <KpiCard label={isEn ? "Paid votes" : "Votes payés"} value={String(user.stats.paidVotes)} />
        <KpiCard label={isEn ? "Events" : "Événements"} value={String(user.stats.totalEvents)} />
        <KpiCard label={isEn ? "Active events" : "Événements actifs"} value={String(user.stats.activeEvents)} />
        <KpiCard label={isEn ? "Revenue (FCFA)" : "Revenu (FCFA)"} value={String(user.stats.totalRevenueCfa)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {isEn ? "Account info" : "Info compte"}
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">ID</dt><dd className="font-mono text-xs">{user.id}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Email" : "Email"}</dt><dd>{user.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Verified" : "Vérifié"}</dt><dd>{user.emailVerifiedAt ? (isEn ? "Yes" : "Oui") : (isEn ? "No" : "Non")}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Created" : "Créé"}</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
            {user.suspendedReason && <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Reason" : "Raison"}</dt><dd className="text-destructive">{user.suspendedReason}</dd></div>}
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {isEn ? "Payment provider" : "Fournisseur paiement"}
          </h3>
          <div className="flex gap-2">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="flex-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">{isEn ? "Default" : "Défaut"}</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <Button onClick={updateProvider} loading={saving === "provider"}>
              {isEn ? "Save" : "Enregistrer"}
            </Button>
          </div>
          {user.subscription && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                {isEn ? "Subscription" : "Abonnement"}
              </h4>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Plan" : "Plan"}</dt><dd>{user.subscription.planType}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Status" : "Statut"}</dt><dd>{user.subscription.status}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{isEn ? "Expires" : "Expire"}</dt><dd>{new Date(user.subscription.expiresAt).toLocaleDateString()}</dd></div>
              </dl>
            </div>
          )}
        </div>
      </div>

      {user.sessions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {isEn ? "Active sessions" : "Sessions actives"} ({user.sessions.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground text-xs uppercase">
                <th className="text-left py-2 px-2">{isEn ? "Created" : "Créée"}</th>
                <th className="text-left py-2 px-2">{isEn ? "Expires" : "Expire"}</th>
                <th className="text-left py-2 px-2">{isEn ? "Status" : "Statut"}</th>
              </tr></thead>
              <tbody>
                {user.sessions.map((s) => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-2 px-2">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="py-2 px-2">{new Date(s.expiresAt).toLocaleString()}</td>
                    <td className="py-2 px-2">
                      <StatusChip variant={s.revokedAt ? "muted" : "active"}>
                        {s.revokedAt ? (isEn ? "Revoked" : "Révoquée") : (isEn ? "Active" : "Active")}
                      </StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showSuspendConfirm}
        onOpenChange={setShowSuspendConfirm}
        title={isEn ? "Suspend user" : "Suspendre l'utilisateur"}
        description={isEn ? "This will block login and all active sessions." : "Cela bloquera la connexion et toutes les sessions actives."}
        confirmLabel={isEn ? "Suspend" : "Suspendre"}
        onConfirm={suspendUser}
      >
        <Input
          label={isEn ? "Reason (optional)" : "Raison (optionnelle)"}
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
          placeholder={isEn ? "Why is this user being suspended?" : "Pourquoi cet utilisateur est-il suspendu ?"}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={isEn ? "Delete user permanently" : "Supprimer définitivement"}
        description={isEn
          ? "This will permanently delete the user, their tenant, all events, votes, and payments. This action cannot be undone."
          : "Cela supprimera définitivement l'utilisateur, son tenant, tous les événements, votes et paiements. Action irréversible."}
        confirmLabel={isEn ? "Delete permanently" : "Supprimer définitivement"}
        variant="destructive"
        onConfirm={deleteUser}
      />
    </AdminPageShell>
  );
}
