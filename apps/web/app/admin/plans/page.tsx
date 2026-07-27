"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, authedFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Input, LoadingState } from "@/components/ui";
import { showToast } from "@/lib/toast";
import {
    AdminPageShell,
    AdminPageHeader,
    AdminSection,
    AdminErrorAlert,
    AdminDataTable,
    AdminTableHead,
    AdminTableRow,
    AdminTh,
    AdminTd
} from "../../../components/admin/admin-shell";
import { Pencil, Trash2, Plus, Save, Check, X, Eye, EyeOff } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Plan = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    priceCfa: number;
    maxEvents: number | null;
    commissionRate: number;
    isActive: boolean;
    sortOrder: number;
    features: string[] | null;
    createdAt: string;
    updatedAt: string;
};

type PlanForm = {
    name: string;
    slug: string;
    description: string;
    priceCfa: number;
    maxEvents: string; // string for input, "unlimited" = null
    commissionRate: number;
    isActive: boolean;
    sortOrder: number;
    features: string;
};

const emptyForm: PlanForm = {
    name: "",
    slug: "",
    description: "",
    priceCfa: 0,
    maxEvents: "",
    commissionRate: 1500,
    isActive: true,
    sortOrder: 0,
    features: ""
};

// ---------------------------------------------------------------------------
// Commission helper
// ---------------------------------------------------------------------------

function bpsToPercent(bps: number): string {
    return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
}

function percentToBps(percent: number): number {
    return Math.round(percent * 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminPlansPage() {
    const router = useRouter();
    const { locale } = useI18n();
    const isEn = locale === "en";

    const [plans, setPlans] = useState<Plan[]>([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<PlanForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    const loadPlans = async () => {
        const token = getStoredToken();
        if (!token) {
            router.push("/admin");
            return;
        }
        try {
            const data = await authedFetch<Plan[]>("/admin/plans");
            setPlans(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur de chargement");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadPlans();
    }, [router]);

    // --- Modal handlers ---

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setShowModal(true);
    };

    const openEdit = (plan: Plan) => {
        setEditingId(plan.id);
        setForm({
            name: plan.name,
            slug: plan.slug,
            description: plan.description ?? "",
            priceCfa: plan.priceCfa,
            maxEvents: plan.maxEvents === null ? "" : String(plan.maxEvents),
            commissionRate: plan.commissionRate,
            isActive: plan.isActive,
            sortOrder: plan.sortOrder,
            features: plan.features?.join("\n") ?? ""
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm(emptyForm);
    };

    const handleChange = (field: keyof PlanForm, value: string | number | boolean) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError("");
        try {
            const payload = {
                name: form.name,
                slug: form.slug,
                description: form.description || undefined,
                priceCfa: form.priceCfa,
                maxEvents: form.maxEvents === "" ? null : Number(form.maxEvents),
                commissionRate: form.commissionRate,
                isActive: form.isActive,
                sortOrder: form.sortOrder,
                features: form.features
                    .split("\n")
                    .map((f) => f.trim())
                    .filter(Boolean)
            };

            if (editingId) {
                await authedFetch(`/admin/plans/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload)
                });
                showToast.success(isEn ? "Plan updated." : "Plan mis à jour.");
            } else {
                await authedFetch("/admin/plans", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                showToast.success(isEn ? "Plan created." : "Plan créé.");
            }

            closeModal();
            void loadPlans();
        } catch (err) {
            showToast.error(err instanceof Error ? err.message : "Erreur");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (plan: Plan) => {
        if (!confirm(isEn ? `Delete plan "${plan.name}"?` : `Supprimer le plan "${plan.name}" ?`)) return;
        try {
            const result = await authedFetch<{ deleted: boolean; deactivated?: boolean }>(`/admin/plans/${plan.id}`, {
                method: "DELETE"
            });
            if (result.deactivated) {
                showToast.info(isEn ? "Plan has subscriptions. Deactivated instead." : "Plan désactivé (abonnements actifs).");
            } else {
                showToast.success(isEn ? "Plan deleted." : "Plan supprimé.");
            }
            void loadPlans();
        } catch (err) {
            showToast.error(err instanceof Error ? err.message : "Erreur");
        }
    };

    if (isLoading) {
        return (
            <AdminPageShell>
                <LoadingState label={isEn ? "Loading plans..." : "Chargement des plans..."} />
            </AdminPageShell>
        );
    }

    return (
        <AdminPageShell>
            <AdminPageHeader
                eyebrow={isEn ? "Subscription Plans" : "Plans d'abonnement"}
                title={isEn ? "Manage Plans" : "Gérer les Plans"}
                description={
                    isEn
                        ? "Configure pricing, commission rates, and event limits for each subscription plan."
                        : "Configurez les prix, les commissions et les limites d'événements pour chaque plan."}
                actions={
                    <Button onClick={openCreate}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {isEn ? "New Plan" : "Nouveau Plan"}
                    </Button>
                }
            />

            {error && <AdminErrorAlert message={error} />}

            <AdminSection
                title={isEn ? "All Plans" : "Tous les plans"}
                description={isEn ? `${plans.length} plan(s) configured` : `${plans.length} plan(s) configuré(s)`}
            >
                <AdminDataTable minWidth="1000px">
                    <AdminTableHead>
                        <tr>
                            <AdminTh>{isEn ? "Name" : "Nom"}</AdminTh>
                            <AdminTh>{isEn ? "Price /mo" : "Prix /mois"}</AdminTh>
                            <AdminTh>{isEn ? "Commission" : "Commission"}</AdminTh>
                            <AdminTh>{isEn ? "Max Events" : "Max Events"}</AdminTh>
                            <AdminTh>{isEn ? "Status" : "Statut"}</AdminTh>
                            <AdminTh className="text-right">{isEn ? "Actions" : "Actions"}</AdminTh>
                        </tr>
                    </AdminTableHead>
                    <tbody>
                        {plans.length === 0 ? (
                            <AdminTableRow>
                                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                                    {isEn ? "No plans yet. Create your first plan." : "Aucun plan. Créez votre premier plan."}
                                </td>
                            </AdminTableRow>
                        ) : (
                            plans.map((plan) => (
                                <AdminTableRow key={plan.id}>
                                    <AdminTd>
                                        <div className="font-semibold text-foreground">{plan.name}</div>
                                        <div className="text-xs text-muted-foreground">/{plan.slug}</div>
                                    </AdminTd>
                                    <AdminTd className="font-bold">
                                        {plan.priceCfa === 0
                                            ? isEn ? "Free" : "Gratuit"
                                            : `${plan.priceCfa.toLocaleString("fr-FR")} CFA`}
                                    </AdminTd>
                                    <AdminTd className="font-bold">{bpsToPercent(plan.commissionRate)}%</AdminTd>
                                    <AdminTd>
                                        {plan.maxEvents === null
                                            ? <span className="text-primary font-semibold">{isEn ? "∞ Unlimited" : "∞ Illimité"}</span>
                                            : plan.maxEvents}
                                    </AdminTd>
                                    <AdminTd>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${plan.isActive
                                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                            }`}>
                                            {plan.isActive
                                                ? plan.isActive ? (isEn ? "Active" : "Actif") : (isEn ? "Inactive" : "Inactif")
                                                : (isEn ? "Inactive" : "Inactif")}
                                        </span>
                                    </AdminTd>
                                    <AdminTd className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button size="sm" variant="secondary" onClick={() => handleDelete(plan)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </AdminTd>
                                </AdminTableRow>
                            ))
                        )}
                    </tbody>
                </AdminDataTable>
            </AdminSection>

            {/* ── Create/Edit Modal ── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
                    <div
                        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-8 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-foreground mb-6">
                            {editingId
                                ? isEn ? "Edit Plan" : "Modifier le plan"
                                : isEn ? "Create Plan" : "Créer un plan"}
                        </h3>

                        <div className="space-y-5">
                            {/* Name & Slug */}
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    id="name"
                                    label={isEn ? "Plan Name" : "Nom du plan"}
                                    value={form.name}
                                    onChange={(e) => handleChange("name", e.target.value)}
                                    placeholder="Ex: Starter"
                                />
                                <Input
                                    id="slug"
                                    label={isEn ? "Slug" : "Slug"}
                                    value={form.slug}
                                    onChange={(e) => handleChange("slug", e.target.value)}
                                    placeholder="Ex: starter"
                                />
                            </div>

                            {/* Description */}
                            <Input
                                id="description"
                                label={isEn ? "Description" : "Description"}
                                value={form.description}
                                onChange={(e) => handleChange("description", e.target.value)}
                                placeholder={isEn ? "Short description of the plan" : "Brève description du plan"}
                            />

                            {/* Price & Commission */}
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    id="priceCfa"
                                    label={isEn ? "Price (CFA/month)" : "Prix (CFA/mois)"}
                                    type="number"
                                    value={form.priceCfa}
                                    onChange={(e) => handleChange("priceCfa", Number(e.target.value))}
                                    min={0}
                                />
                                <div className="grid gap-1.5">
                                    <label htmlFor="commissionRate" className="text-sm font-medium leading-none">
                                        {isEn ? "Commission Rate (%)" : "Taux de commission (%)"}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="commissionRate"
                                            type="range"
                                            min={0}
                                            max={50}
                                            step={0.5}
                                            value={bpsToPercent(form.commissionRate)}
                                            onChange={(e) => handleChange("commissionRate", percentToBps(Number(e.target.value)))}
                                            className="flex-1 h-2 rounded-full bg-muted accent-primary"
                                        />
                                        <span className="w-12 text-right font-bold text-sm">
                                            {bpsToPercent(form.commissionRate)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Max Events & Sort Order */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <label htmlFor="maxEvents" className="text-sm font-medium leading-none">
                                        {isEn ? "Max Events" : "Max Événements"}
                                    </label>
                                    <input
                                        id="maxEvents"
                                        type="text"
                                        value={form.maxEvents}
                                        onChange={(e) => handleChange("maxEvents", e.target.value)}
                                        placeholder={isEn ? "Leave empty for unlimited" : "Laisser vide pour illimité"}
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        {isEn ? "Empty = unlimited" : "Vide = illimité"}
                                    </p>
                                </div>
                                <Input
                                    id="sortOrder"
                                    label={isEn ? "Sort Order" : "Ordre d'affichage"}
                                    type="number"
                                    value={form.sortOrder}
                                    onChange={(e) => handleChange("sortOrder", Number(e.target.value))}
                                />
                            </div>

                            {/* Features */}
                            <div className="grid gap-1.5">
                                <label htmlFor="features" className="text-sm font-medium leading-none">
                                    {isEn ? "Features (one per line)" : "Fonctionnalités (une par ligne)"}
                                </label>
                                <textarea
                                    id="features"
                                    value={form.features}
                                    onChange={(e) => handleChange("features", e.target.value)}
                                    rows={4}
                                    placeholder={isEn
                                        ? "5 événements maximum\nCommission 10%\nSupport prioritaire"
                                        : "5 événements max\nCommission 10%\nSupport prioritaire"}
                                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                />
                            </div>

                            {/* Active toggle */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(e) => handleChange("isActive", e.target.checked)}
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                                />
                                <span className="text-sm font-medium text-foreground">
                                    {isEn ? "Plan is active (visible to users)" : "Plan actif (visible par les utilisateurs)"}
                                </span>
                            </label>
                        </div>

                        {/* Actions */}
                        <div className="mt-8 flex justify-end gap-3">
                            <Button variant="secondary" onClick={closeModal}>
                                {isEn ? "Cancel" : "Annuler"}
                            </Button>
                            <Button onClick={handleSave} loading={isSaving}>
                                <Save className="h-4 w-4 mr-1.5" />
                                {isEn ? "Save" : "Enregistrer"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </AdminPageShell>
    );
}

