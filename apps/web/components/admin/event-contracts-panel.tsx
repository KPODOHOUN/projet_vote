"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { authedFetch } from "@/lib/api";
import { downloadContractPdf } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { Button, Card, FormError, LoadingState } from "@/components/ui";

type AdminContract = {
  id: string;
  status: "PENDING_SIGNATURE" | "SIGNED" | "SUPERSEDED";
  templateVersion: string;
  generatedAt: string;
  signedAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp: string | null;
  otpVerifiedAt: string | null;
  signedPdfSha256: string | null;
};

/** Contrats d'un concours et leurs preuves, côté administration (chaque téléchargement est journalisé). */
export function EventContractsPanel({ eventId }: { eventId: string }) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [contracts, setContracts] = useState<AdminContract[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void authedFetch<AdminContract[]>(`/admin/events/${eventId}/contracts`)
      .then(setContracts)
      .catch((caught) => setError(caught instanceof Error ? caught.message : isEn ? "Loading failed." : "Chargement impossible."));
  }, [eventId, isEn]);

  const label = (status: AdminContract["status"]) =>
    status === "SIGNED" ? (isEn ? "Signed" : "Signé") : status === "SUPERSEDED" ? (isEn ? "Replaced" : "Remplacé") : isEn ? "To sign" : "À signer";

  if (error) return <FormError>{error}</FormError>;
  if (!contracts) return <LoadingState variant="rows" count={1} label={isEn ? "Loading contracts…" : "Chargement des contrats…"} />;
  if (contracts.length === 0) {
    return <p className="text-sm text-muted-foreground">{isEn ? "No contract generated yet." : "Aucun contrat généré pour l'instant."}</p>;
  }
  return (
    <div className="space-y-3">
      {contracts.map((contract) => (
        <Card key={contract.id} className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {label(contract.status)} — {isEn ? "template" : "modèle"} {contract.templateVersion}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                void downloadContractPdf(`/admin/contracts/${contract.id}/pdf`, `contrat-${contract.id}.pdf`).catch(() =>
                  showToast.error(isEn ? "Download failed." : "Le téléchargement a échoué.")
                )
              }
            >
              <Download className="mr-1 size-4" aria-hidden="true" />
              PDF
            </Button>
          </div>
          <p className="text-muted-foreground">
            {isEn ? "Generated" : "Généré"} {formatDateTime(contract.generatedAt, locale)}
            {contract.signedAt ? ` · ${isEn ? "signed" : "signé"} ${formatDateTime(contract.signedAt, locale)} ${isEn ? "by" : "par"} ${contract.signerName ?? ""} (${contract.signerEmail ?? ""})` : ""}
          </p>
          {contract.signedAt ? (
            <p className="break-all font-mono text-xs text-muted-foreground">
              IP {contract.signerIp ?? "—"} · {isEn ? "code verified" : "code vérifié"} {contract.otpVerifiedAt ? formatDateTime(contract.otpVerifiedAt, locale) : "—"} · PDF SHA-256 {contract.signedPdfSha256}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
