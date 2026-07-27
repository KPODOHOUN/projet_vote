"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, ConfirmDialog, EmptyState, Input, LoadingState, StatusChip } from "@/components/ui";
import { AdminPageHeader, AdminPageShell, AdminErrorAlert } from "@/components/admin/admin-shell";

type DisplayPartner = {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
};

export default function AdminDisplayPartnersPage() {
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [partners, setPartners] = useState<DisplayPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [editItem, setEditItem] = useState<DisplayPartner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLogoUrl, setFormLogoUrl] = useState("");
  const [formWebsiteUrl, setFormWebsiteUrl] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);

  const loadPartners = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await apiFetch<DisplayPartner[]>("/admin/display-partners", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPartners(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadPartners(); }, [loadPartners]);

  const openCreate = () => {
    setEditItem(null);
    setFormName("");
    setFormLogoUrl("");
    setFormWebsiteUrl("");
    setFormSortOrder(0);
    setFormActive(true);
    setShowForm(true);
  };

  const openEdit = (p: DisplayPartner) => {
    setEditItem(p);
    setFormName(p.name);
    setFormLogoUrl(p.logoUrl);
    setFormWebsiteUrl(p.websiteUrl ?? "");
    setFormSortOrder(p.sortOrder);
    setFormActive(p.active);
    setShowForm(true);
  };

  const savePartner = async () => {
    const token = getStoredToken();
    if (!token || !formName.trim() || !formLogoUrl.trim()) return;
    setSaving(true);
    try {
      const body = { name: formName, logoUrl: formLogoUrl, websiteUrl: formWebsiteUrl, sortOrder: formSortOrder, active: formActive };
      if (editItem) {
        await apiFetch(`/admin/display-partners/${editItem.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        showToast.success(isEn ? "Partner updated." : "Partenaire mis à jour.");
      } else {
        await apiFetch("/admin/display-partners", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        showToast.success(isEn ? "Partner created." : "Partenaire créé.");
      }
      setShowForm(false);
      await loadPartners();
    } catch { showToast.error(isEn ? "Save failed." : "Échec de l'enregistrement."); }
    finally { setSaving(false); }
  };

  const deletePartner = async () => {
    if (!deleteId) return;
    const token = getStoredToken();
    if (!token) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/display-partners/${deleteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast.success(isEn ? "Partner deleted." : "Partenaire supprimé.");
      setDeleteId(null);
      await loadPartners();
    } catch { showToast.error(isEn ? "Delete failed." : "Échec de la suppression."); }
    finally { setSaving(false); }
  };

  if (isLoading) return <LoadingState variant="kpi" count={3} label={isEn ? "Loading partners…" : "Chargement des partenaires…"} />;
  if (error) return <AdminErrorAlert message={error} />;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Partners" : "Partenaires"}
        title={isEn ? "Display partners" : "Partenaires affichés"}
        description={isEn ? "Partners shown in the carousel on the public website." : "Partenaires affichés dans le carousel sur le site public."}
        actions={<Button onClick={openCreate}>{isEn ? "Add partner" : "Ajouter un partenaire"}</Button>}
      />

      {partners.length === 0 ? (
        <EmptyState
          title={isEn ? "No partners yet" : "Aucun partenaire"}
          description={isEn ? "Add your first display partner." : "Ajoutez votre premier partenaire affiché."}
          action={<Button onClick={openCreate}>{isEn ? "Add partner" : "Ajouter un partenaire"}</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <img src={p.logoUrl} alt={p.name} className="h-10 w-10 rounded-lg object-contain bg-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{isEn ? "Order" : "Ordre"}: {p.sortOrder}</p>
                </div>
                <StatusChip label={p.active ? (isEn ? "Visible" : "Visible") : (isEn ? "Hidden" : "Masqué")} tone={p.active ? "active" : "muted"} />
              </div>
              {p.websiteUrl && (
                <a href={p.websiteUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate">
                  {p.websiteUrl}
                </a>
              )}
              <div className="flex gap-2 mt-auto">
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                  {isEn ? "Edit" : "Modifier"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteId(p.id)}>
                  {isEn ? "Delete" : "Supprimer"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">
              {editItem ? (isEn ? "Edit partner" : "Modifier le partenaire") : (isEn ? "Add partner" : "Ajouter un partenaire")}
            </h3>
            <div className="space-y-4">
              <Input label={isEn ? "Company name" : "Nom de l'entreprise"} value={formName} onChange={(e) => setFormName(e.target.value)} />
              <Input label={isEn ? "Logo URL" : "URL du logo"} value={formLogoUrl} onChange={(e) => setFormLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
              <Input label={isEn ? "Website URL" : "URL du site"} value={formWebsiteUrl} onChange={(e) => setFormWebsiteUrl(e.target.value)} placeholder={isEn ? "Optional" : "Optionnel"} />
              <Input label={isEn ? "Sort order" : "Ordre d'affichage"} type="number" value={String(formSortOrder)} onChange={(e) => setFormSortOrder(Number(e.target.value))} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} className="rounded" />
                {isEn ? "Visible on website" : "Visible sur le site"}
              </label>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={savePartner} loading={saving}>
                  {editItem ? (isEn ? "Update" : "Mettre à jour") : (isEn ? "Create" : "Créer")}
                </Button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  {isEn ? "Cancel" : "Annuler"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={isEn ? "Delete partner" : "Supprimer le partenaire"}
        description={isEn ? "Are you sure?" : "Êtes-vous sûr ?"}
        confirmLabel={isEn ? "Delete" : "Supprimer"}
        variant="destructive"
        onConfirm={deletePartner}
      />
    </AdminPageShell>
  );
}
