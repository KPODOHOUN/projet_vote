"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, getApiBaseUrl } from "../../../../../lib/api";
import { getStoredToken } from "../../../../../lib/auth";
import { useI18n } from "../../../../../lib/i18n-provider";
import { Button, Card, LoadingState, Badge } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { DashboardBreadcrumb } from "../../../../../components/dashboard-breadcrumb";
import { showToast } from "../../../../../lib/toast";
import { formatCfa } from "../../../../../lib/format";
import { Plus, Pencil, Ticket, X, Loader2, AlertCircle, Palette, Download, TrendingUp, ScanLine, Lock } from "lucide-react";

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  priceCfa: number;
  quantity: number;
  maxPerPerson: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  status: string;
  _count: { tickets: number };
};

type TicketStats = {
  totalSold: number;
  totalRevenueCfa: number;
  byType: { id: string; name: string; sold: number; quantity: number; priceCfa: number }[];
};

type DailySale = { date: string; count: number; revenue: number };

type Ticket = {
  id: string;
  holderName: string | null;
  holderPhone: string | null;
  holderEmail: string | null;
  status: string;
  amountCfa: number;
  createdAt: string;
  usedAt: string | null;
  ticketType: { name: string };
};

const TYPE_STATUS: Record<string, readonly [string, string]> = {
  ACTIVE: ["En vente", "On sale"],
  PAUSED: ["En pause", "Paused"],
  SOLD_OUT: ["Épuisé", "Sold out"],
  CANCELLED: ["Annulé", "Cancelled"]
};
const TICKET_STATUS: Record<string, readonly [string, string]> = {
  RESERVED: ["En attente de paiement", "Awaiting payment"],
  PAID: ["Payé", "Paid"],
  CONFIRMED: ["Payé", "Paid"],
  USED: ["Utilisé", "Used"],
  CANCELLED: ["Annulé", "Cancelled"],
  REFUNDED: ["Remboursé", "Refunded"]
};
const pick = (map: Record<string, readonly [string, string]>, status: string, isEn: boolean) =>
  map[status]?.[isEn ? 1 : 0] ?? status;

export default function TicketsPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { locale } = useI18n();
  const isEn = locale === "en";
  const typeStatusLabel = (status: string) => pick(TYPE_STATUS, status, isEn);
  const ticketStatusLabel = (status: string) => pick(TICKET_STATUS, status, isEn);

  const [types, setTypes] = useState<TicketType[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingType, setEditingType] = useState<TicketType | null>(null);
  const [eventStatus, setEventStatus] = useState("DRAFT");
  const [showTickets, setShowTickets] = useState(false);

  const [showTypeFilter, setShowTypeFilter] = useState("");
  const [showStatusFilter, setShowStatusFilter] = useState("");

  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [showChart, setShowChart] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (!token) { router.push("/login"); return; }
      const [typesData, statsData, eventData] = await Promise.all([
        apiFetch<TicketType[]>(`/events/${eventId}/ticket-types`, { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<TicketStats>(`/events/${eventId}/tickets/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<{ status: string }>(`/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setTypes(typesData);
      setStats(statsData);
      setEventStatus(eventData.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, router]);

  async function loadDailySales() {
    try {
      const token = getStoredToken();
      if (!token) return;
      const data = await apiFetch<DailySale[]>(`/events/${eventId}/tickets/stats/daily`, { headers: { Authorization: `Bearer ${token}` } });
      setDailySales(data);
    } catch (error) {
      // Jamais une liste vide sans explication : l'organisateur croirait n'avoir rien vendu.
      showToast.error(error instanceof Error && error.message ? error.message : isEn ? "Sales chart unavailable. Try again." : "Graphique des ventes indisponible. Réessayez.");
    }
  }

  const loadTickets = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (showTypeFilter) params.set("ticketTypeId", showTypeFilter);
      if (showStatusFilter) params.set("status", showStatusFilter);
      const q = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<Ticket[]>(`/events/${eventId}/tickets${q}`, { headers: { Authorization: `Bearer ${token}` } });
      setTickets(data);
    } catch (error) {
      showToast.error(error instanceof Error && error.message ? error.message : isEn ? "Sales list unavailable. Try again." : "Liste des ventes indisponible. Réessayez.");
    }
  }, [eventId, showTypeFilter, showStatusFilter, isEn]);

  function downloadCsv() {
    const token = getStoredToken();
    if (!token) return;
    const a = document.createElement("a");
    a.href = `${getApiBaseUrl()}/events/${eventId}/tickets/export/csv`;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.display = "none";
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" })
      .then((r) => {
        // Une erreur de l'API ne doit pas être téléchargée comme un fichier CSV.
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Libéré après coup : certains navigateurs annulent un téléchargement dont l'URL disparaît aussitôt.
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      })
      .catch(() => showToast.error(isEn ? "Export failed" : "Échec de l'export"));
  }

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { if (showTickets) loadTickets(); }, [showTickets, loadTickets]);

  if (isLoading) return <LoadingState variant="rows" count={4} label={isEn ? "Loading tickets..." : "Chargement des tickets..."} />;
  if (error) return <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 text-destructive border border-destructive/10"><AlertCircle className="h-5 w-5 flex-shrink-0" /><p className="text-sm font-semibold">{error}</p></div>;

  const totalSold = stats?.totalSold ?? 0;
  const totalRevenue = stats?.totalRevenueCfa ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <DashboardBreadcrumb items={[
            { label: isEn ? "Events" : "Événements", href: "/dashboard/events" },
            { label: isEn ? "Tickets" : "Billets" }
          ]} />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{isEn ? "Tickets" : "Billets"}</h1>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <Button
            variant="secondary"
            size="sm"
            className={showChart ? "ring-2 ring-primary/50" : undefined}
            aria-pressed={showChart}
            onClick={() => { setShowChart(!showChart); if (!showChart && dailySales.length === 0) loadDailySales(); }}
          >
            <TrendingUp className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {isEn ? "Chart" : "Graphique"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={showTickets ? "ring-2 ring-primary/50" : undefined}
            aria-pressed={showTickets}
            onClick={() => { setShowTickets(!showTickets); if (!showTickets) loadTickets(); }}
          >
            <Ticket className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {isEn ? "Sales" : "Ventes"}
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadCsv}>
            <Download className="w-4 h-4 mr-1.5" aria-hidden="true" />
            CSV
          </Button>
          {eventStatus === "DRAFT" ? (
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {isEn ? "Add type" : "Ajouter un type"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => router.push(`/dashboard/events/${eventId}/tickets/scan`)}>
              <ScanLine className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {isEn ? "Scan entries" : "Scanner les entrées"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: isEn ? "Sold" : "Vendus", value: String(totalSold) },
          { label: isEn ? "Revenue" : "Revenu", value: formatCfa(totalRevenue, locale) },
          { label: isEn ? "Types" : "Types", value: String(types.length) },
          { label: isEn ? "Capacity" : "Capacité", value: String(types.reduce((a, t) => a + t.quantity, 0)) }
        ].map((stat) => (
          <Card key={stat.label} className="min-w-0 gap-2 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            <p className="truncate text-xl font-black tabular-nums sm:text-2xl">{stat.value}</p>
          </Card>
        ))}
      </div>

      {showChart && dailySales.length > 0 && (
        <Card className="gap-3 p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Daily sales" : "Ventes quotidiennes"}</p>
          <div className="flex h-40 items-stretch gap-2">
            {dailySales.slice(-14).map((d) => {
              const max = Math.max(...dailySales.slice(-14).map((x) => x.count), 1);
              const h = (d.count / max) * 100;
              return (
                <div key={d.date} className="mx-auto flex h-full w-full max-w-12 flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-bold tabular-nums text-foreground">{d.count}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-primary/70 transition-colors hover:bg-primary"
                      style={{ height: `${Math.max(h, 4)}%` }}
                      title={`${d.date}: ${d.count} ${isEn ? "tickets" : "billets"} · ${formatCfa(d.revenue, locale)}`}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {types.map((tt) => (
          <Card key={tt.id} className="p-4">
            <div className="flex items-center justify-between gap-3 text-left">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold">{tt.name}</p>
                  <Badge variant={tt.status === "ACTIVE" ? "default" : tt.status === "PAUSED" ? "secondary" : "destructive"}>
                    {typeStatusLabel(tt.status)}
                  </Badge>
                </div>
                {tt.description && <p className="text-xs text-muted-foreground truncate">{tt.description}</p>}
                {/* Chaque repère passe à la ligne en bloc, jamais coupé au milieu. */}
                <p className="flex flex-wrap gap-x-2 text-xs tabular-nums text-muted-foreground">
                  <span className="whitespace-nowrap">{formatCfa(tt.priceCfa, locale)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">{tt._count.tickets}/{tt.quantity} {isEn ? "sold" : "vendus"}</span>
                  {tt.maxPerPerson < 100 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap">{isEn ? `max ${tt.maxPerPerson} per person` : `${tt.maxPerPerson} max par personne`}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <Button variant="ghost" size="sm" className="h-11 w-11 p-0" aria-label={isEn ? `Design the ticket ${tt.name}` : `Personnaliser le billet ${tt.name}`} onClick={() => router.push(`/dashboard/events/${eventId}/tickets/designer/${tt.id}`)}><Palette className="w-4 h-4" aria-hidden="true" /></Button>
                <Button variant="ghost" size="sm" className="h-11 w-11 p-0" aria-label={isEn ? `Edit ${tt.name}` : `Modifier ${tt.name}`} onClick={() => setEditingType(tt)}><Pencil className="w-4 h-4" aria-hidden="true" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {types.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="font-semibold">{isEn ? "No ticket types yet" : "Aucun type de billet"}</p>
            <p className="text-sm mt-1">{isEn ? "Create your first ticket type to start selling." : "Créez votre premier type de billet pour commencer à vendre."}</p>
          </div>
        )}
      </div>

      {showTickets && (
        <section className="space-y-4 border-t border-border/40 pt-6" aria-labelledby="sales-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="sales-title" className="text-lg font-extrabold">{isEn ? "Sales" : "Ventes"}</h2>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <label className="sr-only" htmlFor="sales-type">{isEn ? "Ticket type" : "Type de billet"}</label>
              <select
                id="sales-type"
                value={showTypeFilter}
                onChange={(e) => setShowTypeFilter(e.target.value)}
                className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm"
              >
                <option value="">{isEn ? "All types" : "Tous les types"}</option>
                {types.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
              </select>
              <label className="sr-only" htmlFor="sales-status">{isEn ? "Status" : "Statut"}</label>
              <select
                id="sales-status"
                value={showStatusFilter}
                onChange={(e) => setShowStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-border/60 bg-background px-3 text-sm"
              >
                <option value="">{isEn ? "All statuses" : "Tous les statuts"}</option>
                {["RESERVED", "PAID", "CONFIRMED", "USED", "CANCELLED"].map((s) => (
                  <option key={s} value={s}>{ticketStatusLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>
          {tickets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
              {isEn ? "No tickets found" : "Aucun billet trouvé"}
            </p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/60 bg-card">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold">{t.holderName ?? (isEn ? "No name" : "Sans nom")}</p>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      {[t.ticketType.name, formatCfa(t.amountCfa, locale), t.holderPhone, t.holderEmail].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge variant={t.status === "USED" ? "default" : t.status === "CANCELLED" ? "destructive" : "secondary"}>{ticketStatusLabel(t.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showCreateForm && (
        <TicketTypeForm
          eventId={eventId}
          isEn={isEn}
          onClose={() => setShowCreateForm(false)}
          onSaved={() => { setShowCreateForm(false); loadTypes(); }}
        />
      )}

      {editingType && (
        <TicketTypeForm
          eventId={eventId}
          isEn={isEn}
          initial={editingType}
          priceLocked={eventStatus !== "DRAFT"}
          onClose={() => setEditingType(null)}
          onSaved={() => { setEditingType(null); loadTypes(); }}
        />
      )}
    </div>
  );
}

function TicketTypeForm({ eventId, isEn, initial, priceLocked = false, onClose, onSaved }: {
  eventId: string;
  isEn: boolean;
  initial?: TicketType;
  /** Concours publié : nom, prix et quantité de ce billet figurent au contrat signé. */
  priceLocked?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceCfa, setPriceCfa] = useState(initial?.priceCfa ?? 1000);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 100);
  const [maxPerPerson, setMaxPerPerson] = useState(initial?.maxPerPerson ?? 10);
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const token = getStoredToken();
      if (!token) return;
      const body: Record<string, unknown> = { name, description: description || undefined, priceCfa, quantity, maxPerPerson };
      if (initial) body.status = status;
      if (initial) {
        await apiFetch(`/events/${eventId}/ticket-types/${initial.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        showToast.success(isEn ? "Ticket type updated" : "Type de billet mis à jour");
      } else {
        await apiFetch(`/events/${eventId}/ticket-types`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        showToast.success(isEn ? "Ticket type created" : "Type de billet créé");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg">{initial ? (isEn ? "Edit ticket type" : "Modifier le type de billet") : (isEn ? "New ticket type" : "Nouveau type de billet")}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={isEn ? "Close" : "Fermer"}><X className="w-4 h-4" /></Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {priceLocked && (
            <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              {isEn ? "Name, price and quantity are fixed by the signed contract." : "Nom, prix et quantité sont fixés par le contrat signé."}
            </p>
          )}
          <div>
            <label htmlFor="tt-name" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Name" : "Nom"}</label>
            <Input id="tt-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={priceLocked} className="mt-1" placeholder="VIP, Standard, Early Bird..." />
          </div>
          <div>
            <label htmlFor="tt-description" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Description" : "Description"}</label>
            <Input id="tt-description" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" placeholder={isEn ? "Optional description" : "Description optionnelle"} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tt-price" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Price (FCFA)" : "Prix (FCFA)"}</label>
              <Input id="tt-price" type="number" min={1} value={priceCfa} onChange={(e) => setPriceCfa(Number(e.target.value))} required disabled={priceLocked} className="mt-1" />
            </div>
            <div>
              <label htmlFor="tt-quantity" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Quantity" : "Quantité"}</label>
              <Input id="tt-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required disabled={priceLocked} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tt-max" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Max per person" : "Max par personne"}</label>
              <Input id="tt-max" type="number" min={1} max={100} value={maxPerPerson} onChange={(e) => setMaxPerPerson(Number(e.target.value))} className="mt-1" />
            </div>
            {initial && (
              <div>
                <label htmlFor="tt-status" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Status" : "Statut"}</label>
                <select id="tt-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 mt-1 rounded-lg border border-border/50 bg-background px-3 text-sm font-semibold">
                  <option value="ACTIVE">{isEn ? "On sale" : "En vente"}</option>
                  <option value="PAUSED">{isEn ? "Paused" : "En pause"}</option>
                  <option value="SOLD_OUT">{isEn ? "Sold out" : "Épuisé"}</option>
                  <option value="CANCELLED">{isEn ? "Cancelled" : "Annulé"}</option>
                </select>
              </div>
            )}
          </div>

          {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 text-destructive border border-destructive/10 text-xs"><AlertCircle className="w-4 h-4" /><p>{error}</p></div>}

          {/* Même grille que les champs au-dessus : les boutons tombent pile sous les colonnes. */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>{isEn ? "Cancel" : "Annuler"}</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {initial ? (isEn ? "Save" : "Enregistrer") : (isEn ? "Create" : "Créer")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
