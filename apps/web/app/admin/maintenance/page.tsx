"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-provider";
import {
  fetchMaintenanceMode,
  updateMaintenanceMode
} from "@/lib/platform-maintenance";
import { showToast } from "@/lib/toast";
import { Button, Card, Input, LoadingState, StatusChip } from "@/components/ui";
import { AdminErrorAlert, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";

export default function AdminMaintenancePage() {
  const router = useRouter();
  const { isPlatformAdmin } = useAuth();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    void fetchMaintenanceMode(token)
      .then((mode) => {
        setMaintenanceEnabled(mode.enabled);
        setMaintenanceMessage(mode.message);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [router]);

  const onToggle = async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsSaving(true);
    try {
      const result = await updateMaintenanceMode(token, {
        enabled: !maintenanceEnabled,
        ...(maintenanceMessage.trim() ? { message: maintenanceMessage.trim() } : {})
      });
      setMaintenanceEnabled(result.enabled);
      setMaintenanceMessage(result.message);
      showToast.success(
        result.enabled
          ? isEn
            ? "Maintenance mode enabled."
            : "Mode maintenance activé."
          : isEn
            ? "Maintenance mode disabled."
            : "Mode maintenance désactivé."
      );
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Update failed." : "Échec.");
    } finally {
      setIsSaving(false);
    }
  };

  const onSaveMessage = async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsSaving(true);
    try {
      const result = await updateMaintenanceMode(token, {
        enabled: maintenanceEnabled,
        message: maintenanceMessage.trim()
      });
      setMaintenanceMessage(result.message);
      showToast.success(isEn ? "Message saved." : "Message enregistré.");
    } catch (caught) {
      showToast.error(caught instanceof Error ? caught.message : isEn ? "Save failed." : "Échec.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingState variant="rows" count={2} label={isEn ? "Loading…" : "Chargement…"} />;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "System" : "Système"}
        title={isEn ? "Maintenance mode" : "Mode maintenance"}
        description={
          isEn
            ? "Temporarily block public access while you work. Data purge and audit deletion are on the Audit log page."
            : "Bloquez temporairement l'accès public pendant vos opérations. La purge et la suppression des logs sont dans le Journal d'audit."
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      <Card className="max-w-2xl space-y-5 border-border p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-500/15 p-2 text-amber-700 dark:text-amber-400">
            <Power className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{isEn ? "Visitor access" : "Accès visiteurs"}</h2>
            <p className="text-sm text-muted-foreground">
              {isEn
                ? "When enabled, public pages show a maintenance message. Operators keep full access."
                : "Quand activé, les pages publiques affichent un message de maintenance. Les opérateurs gardent l'accès complet."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusChip
            label={maintenanceEnabled ? (isEn ? "ACTIVE" : "ACTIF") : isEn ? "INACTIVE" : "INACTIF"}
            tone={maintenanceEnabled ? "warning" : "live"}
          />
          <Button
            type="button"
            variant={maintenanceEnabled ? "secondary" : "primary"}
            loading={isSaving}
            disabled={!isPlatformAdmin}
            onClick={() => void onToggle()}
          >
            {maintenanceEnabled
              ? isEn
                ? "Disable maintenance"
                : "Désactiver"
              : isEn
                ? "Enable maintenance"
                : "Activer la maintenance"}
          </Button>
        </div>

        <Input
          id="maintenanceMessage"
          label={isEn ? "Public message" : "Message public"}
          value={maintenanceMessage}
          onChange={(e) => setMaintenanceMessage(e.target.value)}
          disabled={!isPlatformAdmin}
        />
        <Button type="button" variant="secondary" disabled={!isPlatformAdmin || isSaving} onClick={() => void onSaveMessage()}>
          {isEn ? "Save message" : "Enregistrer le message"}
        </Button>
      </Card>
    </AdminPageShell>
  );
}
