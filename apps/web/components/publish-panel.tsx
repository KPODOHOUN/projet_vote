"use client";

import Link from "next/link";
import { CheckCircle2, FileSignature } from "lucide-react";
import { Button, Card } from "@/components/ui";

type PublishPanelProps = {
  eventId: string;
  eventStatus: string;
  isEn: boolean;
};

/**
 * Mise en ligne d'un concours : elle passe uniquement par la lecture et la
 * signature de son contrat. Aucun paiement, aucun abonnement.
 */
export function PublishPanel({ eventId, eventStatus, isEn }: PublishPanelProps) {
  const contractHref = `/dashboard/events/${eventId}/contract`;
  if (eventStatus === "DRAFT") {
    return (
      <Card className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <FileSignature className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-foreground">{isEn ? "Put your contest online" : "Mettre le concours en ligne"}</h2>
            <p className="text-sm text-muted-foreground">
              {isEn
                ? "Read and sign the contract generated for this contest. Your contest goes online as soon as it is signed."
                : "Lisez et signez le contrat généré pour ce concours. Il passe en ligne dès la signature."}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={contractHref}>{isEn ? "Read and sign the contract" : "Lire et signer le contrat"}</Link>
        </Button>
      </Card>
    );
  }
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="size-5 text-[var(--color-success-text)]" aria-hidden="true" />
        {isEn ? "Contract signed — contest published." : "Contrat signé — concours publié."}
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link href={contractHref}>{isEn ? "View the contract" : "Voir le contrat"}</Link>
      </Button>
    </Card>
  );
}
