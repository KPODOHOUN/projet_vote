"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Input, StatusChip, LoadingState } from "@/components/ui";
import { AdminErrorAlert, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-shell";
import { ShieldCheck, FileText, Check, X, AlertCircle, History, Loader2 } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AccountPartnerRequest = {
  id: string;
  tenantId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  durationMonths: number;
  reason: string | null;
  contractVersion: string;
  contractAcceptedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  negotiatedCommissionBps: number | null;
  signedFullName: string | null;
  signedAt: string | null;
  createdAt: string;
  tenant: {
    displayName: string;
    slug: string;
  };
};

export default function AccountPartnersAdminPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [requests, setRequests] = useState<AccountPartnerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Action state
  const [activeRequest, setActiveRequest] = useState<AccountPartnerRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [commissionBps, setCommissionBps] = useState(2000); // 20% by default
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewContractHtml, setViewContractHtml] = useState<string | null>(null);

  const loadData = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    try {
      const res = await apiFetch<AccountPartnerRequest[]>("/account-partners/admin/requests", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleAction = async () => {
    if (!activeRequest || !actionType) return;
    const token = getStoredToken();
    if (!token) return;

    setIsSubmitting(true);
    setError("");

    try {
      if (actionType === "approve") {
        await apiFetch(`/account-partners/admin/${activeRequest.id}/approve`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            commissionBps: Number(commissionBps),
            note: note || undefined
          })
        });
      } else {
        if (!note.trim()) {
          setError(isEn ? "Please provide a reason for rejection." : "Veuillez indiquer un motif de refus.");
          setIsSubmitting(false);
          return;
        }
        await apiFetch(`/account-partners/admin/${activeRequest.id}/reject`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            note
          })
        });
      }

      // Close modal & reload data
      setActiveRequest(null);
      setActionType(null);
      setNote("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du traitement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const pending = requests.filter(r => r.status === "PENDING");
  const decided = requests.filter(r => r.status !== "PENDING");

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Partnership Admin" : "Partenariats Admin"}
        title={isEn ? "Account Partnerships" : "Partenariats par Compte"}
        description={
          isEn
            ? "Review, approve or reject account-level partnership requests and set custom commission rates."
            : "Examinez les demandes de partenariat des organisateurs et configurez les taux de commission négociés."}
      />

      {error && <AdminErrorAlert message={error} />}

      <div className="space-y-10">
        {/* Pending requests */}
        <section className="space-y-4">
          <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            {isEn ? "Pending Partnership Requests" : "Demandes en attente"}
          </h3>

          {pending.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-2xl bg-card">
              {isEn ? "No pending partnership requests." : "Aucune demande de partenariat en attente."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {pending.map((r) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col md:flex-row justify-between gap-6 hover:shadow transition-shadow">
                  <div className="space-y-4 max-w-2xl">
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-lg text-foreground flex items-center gap-2">
                        {r.tenant?.displayName || r.tenantId}
                        <span className="text-xs font-normal text-muted-foreground">
                          slug: {r.tenant?.slug || "unknown"}
                        </span>
                      </h4>
                      <div className="text-xs text-muted-foreground">
                        {isEn ? "Requested duration :" : "Durée souhaitée :"} <strong className="text-foreground">{r.durationMonths} mois</strong> ·{" "}
                        {isEn ? "Submitted on " : "Soumis le "} {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-muted/40 border border-border/80 text-xs md:text-sm text-muted-foreground leading-relaxed italic font-medium">
                      &ldquo;{r.reason || "Aucune motivation fournie"}&rdquo;
                    </div>

                    <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-border/40 px-3 py-1 rounded-lg w-fit">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{isEn ? `Contract accepted (v${r.contractVersion})` : `Contrat signé (v${r.contractVersion})`}</span>
                    </div>
                    {r.signedFullName && (
                      <div className="text-[10px] text-muted-foreground">
                        {isEn ? "Signed by:" : "Signé par :"} <strong className="text-foreground">{r.signedFullName}</strong>
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-row md:flex-col gap-2 shrink-0 md:justify-center md:items-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const token = getStoredToken();
                        if (!token) return;
                        try {
                          const data = await apiFetch<{ html: string }>(`/account-partners/contract/${r.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          setViewContractHtml(data.html);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Erreur de chargement du contrat");
                        }
                      }}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1" />
                      {isEn ? "Contract" : "Contrat"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveRequest(r);
                        setActionType("approve");
                        setCommissionBps(2000); // 20%
                      }}
                      className="shadow-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="w-4 h-4 mr-1.5 stroke-[3]" />
                      {isEn ? "Approve" : "Approuver"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setActiveRequest(r);
                        setActionType("reject");
                      }}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      {isEn ? "Reject" : "Refuser"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Decided requests */}
        <section className="space-y-4">
          <h3 className="font-extrabold text-xl text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            {isEn ? "Partnership History" : "Historique des décisions"}
          </h3>

          {decided.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-2xl bg-card">
              {isEn ? "No past requests decided." : "Aucune demande passée traitée."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                      <th className="p-4">{isEn ? "Tenant" : "Organisateur"}</th>
                      <th className="p-4">{isEn ? "Duration" : "Durée"}</th>
                      <th className="p-4">{isEn ? "Commission Rate" : "Taux de commission"}</th>
                      <th className="p-4">{isEn ? "Decision Date" : "Date décision"}</th>
                      <th className="p-4">{isEn ? "Admin notes" : "Remarques"}</th>
                      <th className="p-4">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {decided.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-foreground">{r.tenant?.displayName || r.tenantId}</div>
                          <div className="text-[10px] text-muted-foreground">slug: {r.tenant?.slug}</div>
                        </td>
                        <td className="p-4 text-muted-foreground">{r.durationMonths} mois</td>
                        <td className="p-4 font-bold text-foreground">
                          {r.negotiatedCommissionBps ? `${r.negotiatedCommissionBps / 100}%` : "20%"}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="p-4 text-muted-foreground max-w-xs truncate">
                          {r.decisionNote || "—"}
                        </td>
                        <td className="p-4">
                          <StatusChip
                            label={r.status}
                            tone={r.status === "APPROVED" ? "success" : "error"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Programmatic Radix AlertDialog */}
      <AlertDialog open={!!activeRequest && !!actionType} onOpenChange={(open) => { if (!open) { setActiveRequest(null); setActionType(null); setError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "approve"
                ? isEn
                  ? `Approve partnership for ${activeRequest?.tenant?.displayName}`
                  : `Approuver le partenariat de ${activeRequest?.tenant?.displayName}`
                : isEn
                ? `Reject partnership for ${activeRequest?.tenant?.displayName}`
                : `Refuser la demande de ${activeRequest?.tenant?.displayName}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  {actionType === "approve"
                    ? isEn
                      ? "This will activate the Partner plan. Configure the negotiated commission percentage below."
                      : "Cette action va basculer le compte en Partenaire actif. Configurez le taux de commission ci-dessous."
                    : isEn
                    ? "This will decline the request. You must specify a reason for rejection."
                    : "Cette action va rejeter la demande. Saisissez la motivation du refus pour notifier l'organisateur."}
                </p>

                {actionType === "approve" ? (
                  <div className="space-y-4 text-left">
                    <Input
                      id="commissionBps"
                      label={isEn ? "Negotiated Commission Rate (basis points: 1% = 100 bps)" : "Taux de commission (en points de base: 1% = 100 bps)"}
                      type="number"
                      value={commissionBps}
                      onChange={(e) => setCommissionBps(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isEn ? `Equivalent to ${commissionBps / 100}% platform share.` : `Équivaut à ${commissionBps / 100}% de commission prélevée.`}
                    </p>
                    <Input
                      id="note"
                      label={isEn ? "Decision Note (Optional)" : "Note d'approbation (Optionnel)"}
                      placeholder="ex: Contrat signé et validé"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="text-left">
                    <Input
                      id="note"
                      label={isEn ? "Rejection Reason (Required)" : "Motif du refus (Requis)"}
                      placeholder="ex: Motivations insuffisantes"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{isEn ? "Cancel" : "Annuler"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleAction();
              }}
              disabled={isSubmitting}
              className={actionType === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {actionType === "approve"
                ? isEn
                  ? "Approve & Activate"
                  : "Approuver et activer"
                : isEn
                ? "Reject request"
                : "Rejeter la demande"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contract viewer */}
      {viewContractHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViewContractHtml(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b px-6 py-4">
              <h3 className="font-bold text-foreground text-lg">
                {isEn ? "Signed Contract" : "Contrat signé"}
              </h3>
              <button type="button" onClick={() => setViewContractHtml(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div dangerouslySetInnerHTML={{ __html: viewContractHtml }} />
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => window.print()}>
                {isEn ? "Print / Save PDF" : "Imprimer / Enregistrer PDF"}
              </Button>
              <Button type="button" onClick={() => setViewContractHtml(null)}>
                {isEn ? "Close" : "Fermer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
