"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authLoginUrl } from "@/lib/auth-navigation";
import { authedFetch } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { EmptyState, LoadingState, StatusChip } from "@/components/ui";
import {
  AdminDataTable,
  AdminErrorAlert,
  AdminPageHeader,
  AdminPageShell,
  AdminTableHead,
  AdminTableRow,
  AdminTd,
  AdminTh
} from "@/components/admin/admin-shell";

type ActiveEventRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    offerType: "EXTERNAL" | "ESCROW";
  };
  stats: {
    votesCount: number;
    totalCollectedCfa: number;
    platformCommissionCfa: number;
    organizerNetCfa: number;
  };
};

function formatCfa(amount: number, isEn: boolean) {
  return new Intl.NumberFormat(isEn ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(amount);
}

export default function AdminOffersEventsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [rows, setRows] = useState<ActiveEventRow[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push(authLoginUrl());
      return;
    }
    setIsLoading(true);
    void authedFetch<ActiveEventRow[]>("/admin/offers/events/active")
      .then(setRows)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [router]);

  if (isLoading) {
    return <LoadingState variant="rows" count={6} label={isEn ? "Loading events…" : "Chargement des événements…"} />;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={isEn ? "Offers" : "Offres"}
        title={isEn ? "Active events" : "Événements actifs"}
        description={
          isEn
            ? "Live events with offer type and confirmed payment totals."
            : "Événements en cours avec type d'offre et totaux de paiements confirmés."
        }
      />

      {error ? <AdminErrorAlert message={error} /> : null}

      {!error && rows.length === 0 ? (
        <EmptyState
          title={isEn ? "No active events" : "Aucun événement actif"}
          description={isEn ? "Active events will appear here." : "Les événements actifs apparaîtront ici."}
        />
      ) : null}

      {rows.length > 0 ? (
        <AdminDataTable minWidth="960px">
          <AdminTableHead>
            <AdminTableRow>
              <AdminTh>{isEn ? "Event" : "Événement"}</AdminTh>
              <AdminTh>{isEn ? "Organizer" : "Organisation"}</AdminTh>
              <AdminTh>{isEn ? "Offer" : "Offre"}</AdminTh>
              <AdminTh>{isEn ? "Votes" : "Votes"}</AdminTh>
              <AdminTh>{isEn ? "Total" : "Total"}</AdminTh>
              <AdminTh />
            </AdminTableRow>
          </AdminTableHead>
          <tbody>
            {rows.map((row) => (
              <AdminTableRow key={row.id}>
                <AdminTd>
                  <p className="font-semibold text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground">/{row.slug}</p>
                </AdminTd>
                <AdminTd>
                  <p>{row.tenant.displayName}</p>
                  <p className="text-xs text-muted-foreground">{row.tenant.slug}</p>
                </AdminTd>
                <AdminTd>
                  <StatusChip
                    label={row.tenant.offerType}
                    tone={row.tenant.offerType === "ESCROW" ? "live" : "muted"}
                  />
                </AdminTd>
                <AdminTd>{row.stats.votesCount}</AdminTd>
                <AdminTd>{formatCfa(row.stats.totalCollectedCfa, isEn)}</AdminTd>
                <AdminTd>
                  <Link
                    href={`/admin/offers/events/${row.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {isEn ? "Detail" : "Détail"}
                  </Link>
                </AdminTd>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      ) : null}
    </AdminPageShell>
  );
}
