"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, getApiBaseUrl } from "../../../../../lib/api";
import { getStoredToken } from "../../../../../lib/auth";
import { useI18n } from "../../../../../lib/i18n-provider";
import { Button, Card, LoadingState, Badge } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { DashboardBreadcrumb } from "../../../../../components/dashboard-breadcrumb";
import { showToast } from "../../../../../lib/toast";
import { Plus, Pencil, Trash2, Ticket, X, Loader2, AlertCircle, CheckCircle2, Palette, Download, TrendingUp } from "lucide-react";

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

export default function TicketsPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [types, setTypes] = useState<TicketType[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingType, setEditingType] = useState<TicketType | null>(null);
  const [showTickets, setShowTickets] = useState(false);

  const [showTypeFilter, setShowTypeFilter] = useState("");
  const [showStatusFilter, setShowStatusFilter] = useState("");

  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [showChart, setShowChart] = useState(false);

  async function loadTypes() {
    try {
      const token = getStoredToken();
      if (!token) { router.push("/login"); return; }
      const [typesData, statsData] = await Promise.all([
        apiFetch<TicketType[]>(`/events/${eventId}/ticket-types`, { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<TicketStats>(`/events/${eventId}/tickets/stats`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setTypes(typesData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDailySales() {
    try {
      const token = getStoredToken();
      if (!token) return;
      const data = await apiFetch<DailySale[]>(`/events/${eventId}/tickets/stats/daily`, { headers: { Authorization: `Bearer ${token}` } });
      setDailySales(data);
    } catch { /* ignore */ }
  }

  async function loadTickets() {
    try {
      const token = getStoredToken();
      if (!token) return;
      const params = new URLSearchParams();
      if (showTypeFilter) params.set("ticketTypeId", showTypeFilter);
      if (showStatusFilter) params.set("status", showStatusFilter);
      const q = params.toString() ? `?${params.toString()}` : "";
      const data = await apiFetch<Ticket[]>(`/events/${eventId}/tickets${q}`, { headers: { Authorization: `Bearer ${token}` } });
      setTickets(data);
    } catch { /* ignore */ }
  }

  function downloadCsv() {
    const token = getStoredToken();
    if (!token) return;
    const a = document.createElement("a");
    a.href = `${getApiBaseUrl()}/events/${eventId}/tickets/export/csv`;
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.display = "none";
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" })
      .then((r) => r.blob())
      .then((blob) => {
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => showToast.error(isEn ? "Export failed" : "Échec de l'export"));
  }

  useEffect(() => { loadTypes(); }, [eventId]);
  useEffect(() => { if (showTickets) loadTickets(); }, [showTickets, showTypeFilter, showStatusFilter]);

  if (isLoading) return <LoadingState variant="rows" count={4} label={isEn ? "Loading tickets..." : "Chargement des tickets..."} />;
  if (error) return <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 text-destructive border border-destructive/10"><AlertCircle className="h-5 w-5 flex-shrink-0" /><p className="text-sm font-semibold">{error}</p></div>;

  const totalSold = stats?.totalSold ?? 0;
  const totalRevenue = stats?.totalRevenueCfa ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DashboardBreadcrumb items={[
          { label: isEn ? "Events" : "Évènements", href: "/dashboard/events" },
          { label: isEn ? "Tickets" : "Billets" }
        ]} />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setShowChart(!showChart); if (!showChart && dailySales.length === 0) loadDailySales(); }}>
            <TrendingUp className="w-4 h-4 mr-1" />
            {showChart ? (isEn ? "Hide chart" : "Masquer") : (isEn ? "Sales chart" : "Graphique")}
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadCsv}>
            <Download className="w-4 h-4 mr-1" />
            CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowTickets(!showTickets); if (!showTickets) loadTickets(); }}>
            <Ticket className="w-4 h-4 mr-1" />
            {showTickets ? (isEn ? "Hide sales" : "Masquer les ventes") : (isEn ? "View sales" : "Voir les ventes")}
          </Button>
          <Button size="sm" onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {isEn ? "Add type" : "Ajouter un type"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Sold" : "Vendus"}</p>
          <p className="text-2xl font-black">{totalSold}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Revenue" : "Revenu"}</p>
          <p className="text-2xl font-black">{totalRevenue.toLocaleString()} XOF</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Types" : "Types"}</p>
          <p className="text-2xl font-black">{types.length}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Capacity" : "Capacité"}</p>
          <p className="text-2xl font-black">{types.reduce((a, t) => a + t.quantity, 0)}</p>
        </Card>
      </div>

      {showChart && dailySales.length > 0 && (
        <Card className="p-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Daily sales" : "Ventes quotidiennes"}</p>
          <div className="flex items-end gap-2 h-32">
            {dailySales.slice(-14).map((d) => {
              const max = Math.max(...dailySales.slice(-14).map((x) => x.count), 1);
              const h = (d.count / max) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground">{d.count}</span>
                  <div className="w-full rounded-t-md bg-primary/60 hover:bg-primary/80 transition-colors" style={{ height: `${Math.max(h, 4)}%` }} title={`${d.date}: ${d.count} tickets · ${d.revenue.toLocaleString()} XOF`} />
                  <span className="text-[9px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {types.map((tt) => (
          <Card key={tt.id} className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold">{tt.name}</p>
                <Badge variant={tt.status === "ACTIVE" ? "default" : tt.status === "PAUSED" ? "secondary" : "destructive"}>
                  {tt.status}
                </Badge>
              </div>
              {tt.description && <p className="text-xs text-muted-foreground truncate">{tt.description}</p>}
              <p className="text-xs text-muted-foreground">
                {tt.priceCfa.toLocaleString()} XOF · {tt._count.tickets}/{tt.quantity} {isEn ? "sold" : "vendus"}
                {tt.maxPerPerson < 100 && ` · max ${tt.maxPerPerson}/person`}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/events/${eventId}/tickets/designer/${tt.id}`)}><Palette className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingType(tt)}><Pencil className="w-4 h-4" /></Button>
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
        <div className="space-y-3 pt-4 border-t border-border/40">
          <div className="flex items-center gap-2">
            <select
              value={showTypeFilter}
              onChange={(e) => setShowTypeFilter(e.target.value)}
              className="h-9 text-xs rounded-lg border border-border/50 bg-background px-2"
            >
              <option value="">{isEn ? "All types" : "Tous les types"}</option>
              {types.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
            </select>
            <select
              value={showStatusFilter}
              onChange={(e) => setShowStatusFilter(e.target.value)}
              className="h-9 text-xs rounded-lg border border-border/50 bg-background px-2"
            >
              <option value="">{isEn ? "All statuses" : "Tous les statuts"}</option>
              {["RESERVED", "PAID", "CONFIRMED", "USED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{isEn ? "No tickets found" : "Aucun ticket trouvé"}</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30 text-xs">
                  <div>
                    <p className="font-semibold">{t.ticketType.name} · {t.amountCfa.toLocaleString()} XOF</p>
                    <p className="text-muted-foreground">{t.holderName ?? "-"} · {t.holderPhone ?? "-"} · {t.holderEmail ?? "-"}</p>
                  </div>
                  <Badge variant={t.status === "USED" ? "default" : t.status === "CANCELLED" ? "destructive" : "secondary"}>{t.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
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
          onClose={() => setEditingType(null)}
          onSaved={() => { setEditingType(null); loadTypes(); }}
        />
      )}
    </div>
  );
}

function TicketTypeForm({ eventId, isEn, initial, onClose, onSaved }: {
  eventId: string;
  isEn: boolean;
  initial?: TicketType;
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
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Name" : "Nom"}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" placeholder="VIP, Standard, Early Bird..." />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Description" : "Description"}</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" placeholder={isEn ? "Optional description" : "Description optionnelle"} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Price (XOF)" : "Prix (XOF)"}</label>
              <Input type="number" min={1} value={priceCfa} onChange={(e) => setPriceCfa(Number(e.target.value))} required className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Quantity" : "Quantité"}</label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Max per person" : "Max par personne"}</label>
              <Input type="number" min={1} max={100} value={maxPerPerson} onChange={(e) => setMaxPerPerson(Number(e.target.value))} className="mt-1" />
            </div>
            {initial && (
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Status" : "Statut"}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 mt-1 rounded-lg border border-border/50 bg-background px-3 text-sm font-semibold">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="SOLD_OUT">SOLD_OUT</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            )}
          </div>

          {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 text-destructive border border-destructive/10 text-xs"><AlertCircle className="w-4 h-4" /><p>{error}</p></div>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">{isEn ? "Cancel" : "Annuler"}</Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {initial ? (isEn ? "Save" : "Enregistrer") : (isEn ? "Create" : "Créer")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
