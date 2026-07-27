"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api";
import { getStoredToken } from "../../../../lib/auth";
import { useI18n } from "../../../../lib/i18n-provider";
import { Button, Input, LoadingState, StatusChip } from "@/components/ui";
import { Shield, ArrowLeft, Check, FileText, AlertCircle, History, Eye, PenLine } from "lucide-react";
import { authLoginUrl } from "@/lib/auth-navigation";

type ContractTemplate = {
  version: string;
  title: string;
  html: string;
  tenantName: string;
  generatedAt: string;
};

type AccountPartnerRequest = {
  id: string;
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
};

export default function PartnerPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [contract, setContract] = useState<ContractTemplate | null>(null);
  const [requests, setRequests] = useState<AccountPartnerRequest[]>([]);
  const [duration, setDuration] = useState(12);
  const [reason, setReason] = useState("");
  const [signedFullName, setSignedFullName] = useState("");
  const [accepted, setAccepted] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [viewContractId, setViewContractId] = useState<string | null>(null);
  const [contractHtml, setContractHtml] = useState<string | null>(null);
  const [isLoadingContract, setIsLoadingContract] = useState(false);

  const loadData = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    try {
      const [contractData, requestsData] = await Promise.all([
        apiFetch<ContractTemplate>("/account-partners/contract-preview", {
          headers: { Authorization: `Bearer ${token}` }
        }),
        apiFetch<AccountPartnerRequest[]>("/account-partners/my-requests", {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setContract(contractData);
      setRequests(requestsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const loadContract = async (requestId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setIsLoadingContract(true);
    try {
      const data = await apiFetch<{ html: string }>(`/account-partners/contract/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setContractHtml(data.html);
      setViewContractId(requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement du contrat");
    } finally {
      setIsLoadingContract(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signedFullName.trim()) {
      setError(isEn ? "Please enter your full name to sign the contract." : "Veuillez saisir votre nom complet pour signer le contrat.");
      return;
    }
    if (!accepted) {
      setError(isEn ? "You must accept the contract terms." : "Vous devez accepter les conditions du contrat.");
      return;
    }
    if (reason.trim().length < 20) {
      setError(isEn ? "Please provide a reason of at least 20 characters." : "Veuillez fournir une motivation d'au moins 20 caractères.");
      return;
    }

    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await apiFetch("/account-partners/request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          durationMonths: duration,
          reason,
          signedFullName: signedFullName.trim(),
          acceptedTerms: true
        })
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard/subscription");
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la demande");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label={isEn ? "Loading contract template..." : "Chargement du contrat..."} />;
  }

  const hasPendingRequest = requests.some(r => r.status === "PENDING");

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/subscription" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            {isEn ? "Request Account Partnership" : "Demande de Partenariat Compte"}
          </h1>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {success ? (
        <div className="max-w-md mx-auto text-center rounded-2xl border border-primary/20 bg-card p-8 shadow-lg space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-foreground">
              {isEn ? "Request Submitted !" : "Demande Soumise !"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isEn
                ? "Your partnership request has been sent for admin review. Redirecting..."
                : "Votre demande de partenariat a été transmise aux administrateurs. Redirection..."}
            </p>
          </div>
        </div>
      ) : hasPendingRequest ? (
        <div className="max-w-md mx-auto text-center rounded-2xl border border-amber-500/20 bg-card p-8 shadow-md space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500">
              <AlertCircle className="w-8 h-8" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {isEn ? "Request Under Review" : "Demande en cours d'examen"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isEn
                ? "You already have a pending partnership request. Our team will review it shortly."
                : "Vous avez déjà une demande de partenariat en cours d'examen. Notre équipe l'étudiera rapidement."}
            </p>
          </div>
          <div className="pt-4">
            <Link href="/dashboard/subscription">
              <Button variant="secondary" className="w-full">
                {isEn ? "Back to my plan" : "Retour à mon plan"}
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Partnership Form */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6 self-start">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">
                {isEn ? "Application Details" : "Informations de demande"}
              </h2>
              <p className="text-muted-foreground text-xs">
                {isEn
                  ? "Provide details about your usage goals to apply for partnership."
                  : "Expliquez brièvement votre projet pour motiver la demande de partenariat."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="duration" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {isEn ? "Desired Duration" : "Durée souhaitée"}
                </label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
                >
                  <option value={3}>{isEn ? "3 Months" : "3 Mois"}</option>
                  <option value={6}>{isEn ? "6 Months" : "6 Mois"}</option>
                  <option value={12}>{isEn ? "12 Months (Recommended)" : "12 Mois (Recommandé)"}</option>
                  <option value={24}>{isEn ? "24 Months" : "24 Mois"}</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="reason" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {isEn ? "Motivation (Min 20 chars)" : "Motivation (Min 20 caractères)"}
                </label>
                <textarea
                  id="reason"
                  rows={4}
                  placeholder={isEn ? "Describe your events scope, estimated turnout..." : "Présentez l'envergure de vos évènements, prévisions de votes..."}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm resize-none font-medium"
                  required
                />
              </div>

              {/* Digital Signature */}
              <div className="space-y-2 border-t border-border pt-4">
                <label htmlFor="signedFullName" className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <PenLine className="w-3.5 h-3.5" />
                  {isEn ? "Digital Signature" : "Signature numérique"}
                </label>
                <p className="text-[10px] text-muted-foreground leading-relaxed -mt-1 mb-2">
                  {isEn
                    ? "Type your full legal name as it appears on official documents. This constitutes your electronic signature."
                    : "Saisissez votre nom complet tel qu'il figure sur vos documents officiels. Cela constitue votre signature électronique."}
                </p>
                <input
                  id="signedFullName"
                  type="text"
                  placeholder={isEn ? "Enter your full legal name" : "Entrez votre nom complet"}
                  value={signedFullName}
                  onChange={(e) => setSignedFullName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium"
                  required
                />
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <input
                  id="acceptTerms"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={isSubmitting}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                />
                <label htmlFor="acceptTerms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none">
                  {isEn
                    ? "I have read and accept all terms of the platform partnership agreement shown on the right, and I understand that typing my name above constitutes my electronic signature."
                    : "J'ai lu et j'accepte sans réserve les termes du contrat de partenariat présenté à droite, et je reconnais que la saisie de mon nom ci-dessus vaut signature électronique."}
                </label>
              </div>

              <Button type="submit" disabled={isSubmitting || !accepted || !signedFullName.trim()} className="w-full h-11 font-bold shadow-md">
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 mr-2 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    {isEn ? "Submitting..." : "Transmission..."}
                  </>
                ) : (
                  <>
                    <PenLine className="w-4 h-4 mr-1.5" />
                    {isEn ? "Sign & Submit Application" : "Signer et soumettre la demande"}
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Contract Template Preview */}
          {contract && (
            <div className="lg:col-span-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
              <div className="bg-muted/40 border-b border-border px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <FileText className="w-5 h-5 text-primary" />
                  <span>{contract.title}</span>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-border text-muted-foreground">
                  {contract.version}
                </span>
              </div>
              <div className="overflow-y-auto max-h-[600px] bg-white">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: contract.html }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* History of requests */}
      {requests.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-xl text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            {isEn ? "Partnership Requests History" : "Historique des demandes"}
          </h3>
          
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                    <th className="p-4">{isEn ? "Requested Duration" : "Durée"}</th>
                    <th className="p-4">{isEn ? "Submission Date" : "Date de soumission"}</th>
                    <th className="p-4">{isEn ? "Commission Rate" : "Taux négocié"}</th>
                    <th className="p-4">{isEn ? "Signed By" : "Signé par"}</th>
                    <th className="p-4">{isEn ? "Note" : "Remarques admin"}</th>
                    <th className="p-4">{isEn ? "Status" : "Statut"}</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-semibold text-foreground">
                        {r.durationMonths} {isEn ? "months" : "mois"}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR")}
                      </td>
                      <td className="p-4 text-foreground font-medium">
                        {r.negotiatedCommissionBps ? `${r.negotiatedCommissionBps / 100}%` : "—"}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {r.signedFullName || "—"}
                      </td>
                      <td className="p-4 text-muted-foreground max-w-xs truncate">
                        {r.decisionNote || "—"}
                      </td>
                      <td className="p-4">
                        <StatusChip
                          label={r.status}
                          tone={
                            r.status === "APPROVED"
                              ? "success"
                              : r.status === "PENDING"
                              ? "warning"
                              : "error"
                          }
                        />
                      </td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => loadContract(r.id)}
                          className="text-primary hover:text-primary/80 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isEn ? "Contract" : "Contrat"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Contract viewer modal */}
      {viewContractId && contractHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setViewContractId(null); setContractHtml(null); }}>
          <div className="relative max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b px-6 py-4">
              <h3 className="font-bold text-foreground text-lg">
                {isEn ? "Signed Contract" : "Contrat signé"}
              </h3>
              <button
                type="button"
                onClick={() => { setViewContractId(null); setContractHtml(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div dangerouslySetInnerHTML={{ __html: contractHtml }} />
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.print()}
              >
                {isEn ? "Print / Save PDF" : "Imprimer / Enregistrer PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
