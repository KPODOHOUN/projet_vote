"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import type { FormEvent } from "react";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, ConfirmDialog, Input, StatusChip, EmptyState, LoadingState } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminFilterCard,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect
} from "@/components/admin/admin-shell";
import { deleteFeatureFlag } from "@/lib/audit-logs";
import { showToast } from "@/lib/toast";

type FeatureFlagItem = {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  updatedAt: string;
};

type FeatureFlagsResponse = {
  tenantId: string;
  items: FeatureFlagItem[];
};

export default function DashboardAdminFeatureFlagsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [items, setItems] = useState<FeatureFlagItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [rolloutPercent, setRolloutPercent] = useState(100);
  const [tenantId, setTenantId] = useState("");

  const loadFlags = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    const query = tenantId.trim() ? `?tenantId=${encodeURIComponent(tenantId.trim())}` : "";
    const response = await apiFetch<FeatureFlagsResponse>(`/admin/feature-flags${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setItems(response.items);
  };

  useEffect(() => {
    setError("");
    setIsLoading(true);
    void (async () => {
      try {
        await loadFlags();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : isEn ? "Unable to load feature flags." : "Chargement des indicateurs de fonctionnalité impossible.");
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await apiFetch("/admin/feature-flags", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          key: newKey.trim(),
          enabled,
          rolloutPercent,
          ...(tenantId.trim() ? { tenantId: tenantId.trim() } : {})
        })
      });
      setNewKey("");
      setEnabled(true);
      setRolloutPercent(100);
      await loadFlags();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : isEn ? "Unable to save feature flag." : "Sauvegarde du flag impossible.");
    } finally {
      setIsSaving(false);
    }
  };

  const onDeleteFlag = async (key: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      await deleteFeatureFlag(token, key, tenantId.trim() || undefined);
      showToast.success(isEn ? "Flag deleted." : "Flag supprimé.");
      await loadFlags();
    } catch (caughtError) {
      showToast.error(caughtError instanceof Error ? caughtError.message : isEn ? "Delete failed." : "Suppression impossible.");
    }
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "System" : "Système"}
        title={isEn ? "Feature flags" : "Indicateurs de fonctionnalité"}
        description={
          isEn
            ? "Toggle platform features per tenant or globally."
            : "Activez ou désactivez des fonctionnalités par tenant ou globalement."
        }
      />

      <form onSubmit={onSubmit}>
        <AdminFilterCard columns="md:grid-cols-2 lg:grid-cols-4" className="items-end">
          <Input
            id="tenantId"
            label={isEn ? "Tenant ID (optional)" : "ID du tenant (optionnel)"}
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="cuid tenant"
          />
          <Input
            id="newKey"
            label={isEn ? "Flag key" : "Clé de l'indicateur"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="payments.fast_confirm"
            required
          />
          <AdminSelect
            id="flagEnabled"
            label={isEn ? "Enabled" : "Actif"}
            value={enabled ? "true" : "false"}
            onChange={(v) => setEnabled(v === "true")}
            options={[
              { value: "true", label: "true" },
              { value: "false", label: "false" }
            ]}
          />
          <Input
            id="rolloutPercent"
            label={isEn ? "Rollout %" : "Déploiement %"}
            type="number"
            min={0}
            max={100}
            value={rolloutPercent}
            onChange={(e) => setRolloutPercent(Number(e.target.value))}
          />
          <div className="flex justify-end lg:col-span-4">
            <Button type="submit" loading={isSaving}>
              {isEn ? "Save flag" : "Enregistrer le flag"}
            </Button>
          </div>
        </AdminFilterCard>
      </form>

      {isLoading ? (
        <LoadingState variant="rows" count={3} label={isEn ? "Loading feature flags…" : "Chargement des indicateurs…"} />
      ) : error ? (
        <AdminErrorAlert message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title={isEn ? "No feature flags" : "Aucun indicateur"}
          description={isEn ? "No feature flags for this tenant." : "Aucun indicateur de fonctionnalité pour ce tenant."}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:shadow transition-shadow gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <StatusChip
                  label={item.enabled ? (isEn ? "ENABLED" : "ACTIF") : (isEn ? "DISABLED" : "INACTIF")}
                  tone={item.enabled ? "success" : "error"}
                />
                <strong className="text-foreground">{item.key}</strong>
                <span className="text-sm text-muted-foreground">
                  {isEn ? "rollout" : "déploiement"}: {item.rolloutPercent}% ·{" "}
                  {isEn ? "updated" : "maj"}{" "}
                  {new Date(item.updatedAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ConfirmDialog
                  title={isEn ? "Delete feature flag?" : "Supprimer le flag ?"}
                  description={item.key}
                  confirmLabel={isEn ? "Delete" : "Supprimer"}
                  cancelLabel={isEn ? "Cancel" : "Annuler"}
                  onConfirm={() => void onDeleteFlag(item.key)}
                  trigger={
                    <Button type="button" size="sm" variant="ghost" className="text-destructive">
                      {isEn ? "Delete" : "Supprimer"}
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminPageShell>
  );
}
