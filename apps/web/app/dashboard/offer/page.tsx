"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch } from "@/lib/api";
import { authLoginUrl } from "@/lib/auth-navigation";
import { getStoredToken } from "@/lib/auth";
import { Button, Card, LoadingState } from "@/components/ui";

type OfferResponse = {
  offerType: "EXTERNAL" | "ESCROW";
  provider: "FEDAPAY" | "FEEXPAY" | "KKIAPAY" | null;
  fedapaySubAccount: {
    reference: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
    ready: boolean;
  };
};

export default function OrganizerOfferPage() {
  const router = useRouter();
  const [offer, setOffer] = useState<OfferResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getStoredToken()) {
      router.push(authLoginUrl());
      return;
    }
    const response = await authedFetch<OfferResponse>("/organizer/offer");
    setOffer(response);
  }, [router]);

  useEffect(() => {
    setIsLoading(true);
    void load()
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Chargement impossible.")
      )
      .finally(() => setIsLoading(false));
  }, [load]);

  if (isLoading) {
    return <LoadingState label="Chargement de votre offre…" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Paiements</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Mon offre</h1>
        <p className="mt-2 text-muted-foreground">
          Offre active : <strong>{offer?.offerType ?? "Indisponible"}</strong>
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </Card>
      ) : null}

      {offer?.offerType === "EXTERNAL" ? (
        <Card className="space-y-4 border-[var(--color-warning)]/30 bg-amber-500/5 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">En réflexion</p>
            <h2 className="mt-1 text-xl font-bold">Offre External indisponible</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pendant la phase de test, seule l&apos;offre Escrow est opérationnelle.
              L&apos;offre External reste en réflexion. Contactez le support pour basculer
              vers Escrow si besoin.
            </p>
          </div>
          {offer.fedapaySubAccount.reference ? (
            <p className="text-sm text-muted-foreground">
              Référence FedaPay enregistrée : <code>{offer.fedapaySubAccount.reference}</code>
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="space-y-4 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Offre active</p>
            <h2 className="mt-1 text-xl font-bold">Encaissement plateforme (Escrow)</h2>
            <p className="mt-2 text-muted-foreground">
              Les paiements confirmés alimentent votre portefeuille. À la clôture, la
              plateforme applique la retenue, puis vous demandez un retrait validé par
              l&apos;administration. En phase de test, les paiements sont en mode démo
              (aucun débit Mobile Money réel).
            </p>
          </div>
          <Button type="button" onClick={() => router.push("/dashboard/wallet")}>
            Ouvrir mon portefeuille
          </Button>
        </Card>
      )}
    </div>
  );
}
