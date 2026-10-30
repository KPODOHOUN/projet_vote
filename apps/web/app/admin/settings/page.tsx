"use client";
import { authLoginUrl } from "@/lib/auth-navigation";
import { apiFetch } from "@/lib/api";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Shield, Key, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, LoadingState } from "@/components/ui";
import {
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminStatGrid,
  AdminStatTile
} from "@/components/admin/admin-shell";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { roleLabel } from "../../../lib/admin-labels";
import {
  getPlatformSettings,
  savePlatformFeexpayCredentials,
  type PlatformSettingsResponse
} from "../../../lib/platform-settings";
import { showToast } from "../../../lib/toast";

export default function DashboardAdminSettingsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [data, setData] = useState<PlatformSettingsResponse | null>(null);
  const [feexpayApiKey, setFeexpayApiKey] = useState("");
  const [feexpayShopId, setFeexpayShopId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingFeexpay, setIsSavingFeexpay] = useState(false);

  // Admin management
  const [admins, setAdmins] = useState<{ id: string; email: string; role: string; createdAt: string; }[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  // API keys
  const [apiKeys, setApiKeys] = useState<{ id: string; label: string; keyPrefix: string; createdAt: string; revokedAt: string | null; }[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [showNewKey, setShowNewKey] = useState(false);

  const loadAdmins = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const data = await apiFetch<typeof admins>("/admin/admins", { headers: { Authorization: `Bearer ${token}` } });
      setAdmins(data);
    } catch { /* silent */ }
    finally { setAdminsLoading(false); }
  }, []);

  const loadApiKeys = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const data = await apiFetch<typeof apiKeys>("/admin/api-keys", { headers: { Authorization: `Bearer ${token}` } });
      setApiKeys(data);
    } catch { /* silent */ }
    finally { setApiKeysLoading(false); }
  }, []);

  const addAdmin = async () => {
    const token = getStoredToken();
    if (!token || !newAdminEmail.trim() || !newAdminPassword.trim()) return;
    setSavingAdmin(true);
    try {
      await apiFetch("/admin/admins", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: newAdminEmail, password: newAdminPassword })
      });
      showToast.success(isEn ? "Admin added." : "Administrateur ajouté.");
      setNewAdminEmail("");
      setNewAdminPassword("");
      await loadAdmins();
    } catch { showToast.error(isEn ? "Failed to add admin." : "Échec d'ajout de l'administrateur."); }
    finally { setSavingAdmin(false); }
  };

  const createApiKey = async () => {
    const token = getStoredToken();
    if (!token || !newKeyLabel.trim()) return;
    setSavingKey(true);
    try {
      const result = await apiFetch<{ rawKey: string }>("/admin/api-keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label: newKeyLabel })
      });
      setNewKeyRaw(result.rawKey);
      setShowNewKey(true);
      setNewKeyLabel("");
      await loadApiKeys();
    } catch { showToast.error(isEn ? "Failed to create key." : "Échec de création de la clé."); }
    finally { setSavingKey(false); }
  };

  const revokeApiKey = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      await apiFetch(`/admin/api-keys/${id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast.success(isEn ? "Key revoked." : "Clé révoquée.");
      await loadApiKeys();
    } catch { showToast.error(isEn ? "Failed to revoke." : "Échec de révocation."); }
  };

  useEffect(() => {
    loadAdmins();
    loadApiKeys();
  }, [loadAdmins, loadApiKeys]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setIsLoading(true);
    void (async () => {
      try {
        const response = await getPlatformSettings(token);
        setData(response);
        setFeexpayShopId(response.feexpayShopId);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : isEn
              ? "Unable to load settings."
              : "Chargement des réglages impossible."
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router, isEn]);

  async function onSaveFeexpay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token || feexpayApiKey.trim().length < 16) return;
    setIsSavingFeexpay(true);
    setError("");
    try {
      const setup = await savePlatformFeexpayCredentials(token, {
        apiKey: feexpayApiKey.trim(),
        ...(feexpayShopId.trim() ? { shopId: feexpayShopId.trim() } : {})
      });
      setData((prev: PlatformSettingsResponse | null) =>
        prev
          ? {
              ...prev,
              feexpayShopId: feexpayShopId.trim() || prev.feexpayShopId,
              paymentSetup: setup
            }
          : prev
      );
      setFeexpayApiKey("");
      showToast.success(isEn ? "Payment account saved." : "Compte de paiement enregistré.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : isEn
            ? "FeexPay save failed."
            : "Enregistrement FeexPay impossible."
      );
    } finally {
      setIsSavingFeexpay(false);
    }
  }

  const setup = data?.paymentSetup;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Platform" : "Plateforme"}
        title={isEn ? "Platform settings" : "Réglages plateforme"}
        description={
          isEn
            ? "SHADOMA's payment account. Commission and reserve are set under Money."
            : "Compte de paiement de SHADOMA. La commission et la réserve se règlent dans Argent."
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      {isLoading ? (
        <LoadingState variant="rows" count={3} label={isEn ? "Loading…" : "Chargement…"} />
      ) : (
        <>
          <AdminStatGrid columns="grid-cols-1 sm:grid-cols-2">
            <AdminStatTile
              label={isEn ? "Payment account" : "Compte de paiement"}
              value={setup?.feexpayConfigured ? (isEn ? "Ready" : "Prêt") : isEn ? "Not set" : "Non configuré"}
            />
            <AdminStatTile label={isEn ? "Commission & reserve" : "Commission et réserve"} value={isEn ? "Money section" : "Rubrique Argent"} href="/admin/offers" />
          </AdminStatGrid>

          <Card className="border border-primary/20 bg-primary/5 p-6 space-y-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-foreground">
                {isEn ? "SHADOMA payment account" : "Compte de paiement SHADOMA"}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {isEn
                ? "SHADOMA collects every payment (votes and tickets) on this account, then pays organizers their share."
                : "SHADOMA encaisse tous les paiements (votes et billets) sur ce compte, puis reverse leur part aux organisateurs."}
            </p>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSaveFeexpay}>
              <Input
                id="platformFeexpayKey"
                label={isEn ? "Connection code" : "Code de connexion"}
                type="password"
                value={feexpayApiKey}
                onChange={(e) => setFeexpayApiKey(e.target.value)}
                placeholder={isEn ? "Paste code here" : "Collez le code ici"}
              />
              <Input
                id="platformFeexpayShop"
                label={isEn ? "Shop reference (optional)" : "Référence boutique (optionnel)"}
                value={feexpayShopId}
                onChange={(e) => setFeexpayShopId(e.target.value)}
              />
              <div className="md:col-span-2">
                <Button type="submit" loading={isSavingFeexpay}>
                  {isEn ? "Save payment account" : "Enregistrer le compte"}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                {isEn ? "Administrators" : "Administrateurs"}
              </h2>
            </div>
            {adminsLoading ? (
              <LoadingState variant="rows" count={2} label="" />
            ) : (
              <div className="space-y-3 mb-4">
                {admins.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {isEn ? "Added on " : "Ajouté le "}
                        {new Date(a.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{roleLabel(a.role, isEn)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {isEn ? "Add administrator" : "Ajouter un administrateur"}
              </h3>
              <div className="flex flex-col gap-3">
                <Input
                  label={isEn ? "Email" : "Email"}
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
                <Input
                  label={isEn ? "Password" : "Mot de passe"}
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder={isEn ? "Min 10 characters" : "10 caractères minimum"}
                />
                <Button onClick={addAdmin} loading={savingAdmin}>
                  <Plus className="h-4 w-4 mr-2" />
                  {isEn ? "Add administrator" : "Ajouter l'administrateur"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Key className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                {isEn ? "API Keys" : "Clés API"}
              </h2>
            </div>
            {apiKeysLoading ? (
              <LoadingState variant="rows" count={2} label="" />
            ) : (
              <div className="space-y-2 mb-4">
                {apiKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{k.label}</p>
                      <p className="text-xs font-mono text-muted-foreground">{k.keyPrefix}...{k.revokedAt ? ` (${isEn ? "revoked" : "révoquée"})` : ""}</p>
                    </div>
                    {!k.revokedAt && (
                      <Button size="sm" variant="ghost" aria-label={isEn ? `Revoke key ${k.label}` : `Révoquer la clé ${k.label}`} onClick={() => revokeApiKey(k.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {isEn ? "Create API key" : "Créer une clé API"}
              </h3>
              <div className="flex gap-2">
                <Input
                  label={isEn ? "Label" : "Libellé"}
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder={isEn ? "e.g. CI/CD" : "Ex: CI/CD"}
                  className="flex-1"
                />
                <div className="flex items-end">
                  <Button onClick={createApiKey} loading={savingKey}>
                    <Plus className="h-4 w-4 mr-2" />
                    {isEn ? "Create" : "Créer"}
                  </Button>
                </div>
              </div>
            </div>

            {showNewKey && (
              <div className="mt-4 p-4 rounded-xl border border-[var(--color-warning)]/30 bg-amber-500/5">
                <p className="text-sm font-semibold text-[var(--color-warning-text)] mb-2">
                  {isEn ? "Save this key now — it won't be shown again!" : "Enregistrez cette clé — elle ne sera plus affichée !"}
                </p>
                <code className="block p-3 rounded-lg bg-background text-xs font-mono break-all select-all">
                  {newKeyRaw}
                </code>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => { navigator.clipboard.writeText(newKeyRaw); showToast.success(isEn ? "Copied!" : "Copié !"); }}>
                  {isEn ? "Copy" : "Copier"}
                </Button>
                <Button size="sm" variant="ghost" className="mt-2 ml-2" onClick={() => setShowNewKey(false)}>
                  {isEn ? "Dismiss" : "Ignorer"}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </AdminPageShell>
  );
}
