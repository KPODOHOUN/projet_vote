"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useI18n } from "../../../../lib/i18n-provider";
import { Button, Card, Badge, LoadingState } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, CheckCircle2, AlertCircle, Loader2, Ticket, Phone, Mail, User } from "lucide-react";
import { sanitizePhoneInput } from "../../../../lib/phone";

type PublicTicketType = {
  id: string;
  name: string;
  description: string | null;
  priceCfa: number;
  quantity: number;
  maxPerPerson: number;
  _count: { tickets: number };
};

type PurchaseResult = {
  tickets: { id: string; qrSecret: string; amountCfa: number }[];
  transaction: { id: string; amountCfa: number; status: string };
};

type TicketInfo = {
  id: string;
  qrSecret: string;
  amountCfa: number;
  ticketType: { name: string; priceCfa: number };
  event: { title: string; slug: string };
  status: string;
  holderName: string | null;
};

export default function PublicTicketsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [ticketTypes, setTicketTypes] = useState<PublicTicketType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedType, setSelectedType] = useState<PublicTicketType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [holderName, setHolderName] = useState("");
  const [holderPhone, setHolderPhone] = useState("");
  const [holderEmail, setHolderEmail] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [purchasedTicket, setPurchasedTicket] = useState<TicketInfo | null>(null);

  useEffect(() => {
    apiFetch<PublicTicketType[]>(`/public/events/${slug}/ticket-types`)
      .then(setTicketTypes)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [slug]);

  async function onPurchase() {
    if (!selectedType) return;
    setIsPurchasing(true);
    setPurchaseError("");
    try {
      const result = await apiFetch<PurchaseResult>(`/public/events/${slug}/tickets/purchase`, {
        method: "POST",
        body: JSON.stringify({
          ticketTypeId: selectedType.id,
          quantity,
          holderName: holderName || undefined,
          holderPhone: holderPhone || undefined,
          holderEmail: holderEmail || undefined
        })
      });
      setPurchaseResult(result);
      if (result.tickets.length > 0) {
        const ticketInfo = await apiFetch<TicketInfo>(`/public/tickets/${result.tickets[0]!.id}`);
        setPurchasedTicket(ticketInfo);
      }
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : "Erreur lors de l'achat");
    } finally {
      setIsPurchasing(false);
    }
  }

  if (isLoading) return <LoadingState variant="rows" count={3} />;
  if (error) return <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 text-destructive border border-destructive/10"><AlertCircle className="h-5 w-5" /><p className="text-sm font-semibold">{error}</p></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="text-center space-y-2">
        <Ticket className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-2xl font-black">{isEn ? "Buy Tickets" : "Acheter des billets"}</h1>
      </div>

      {!purchasedTicket && (
        <>
          {!selectedType ? (
            <div className="space-y-4">
              {ticketTypes.map((tt) => {
                const sold = tt._count.tickets;
                const remaining = tt.quantity - sold;
                return (
                  <motion.div
                    key={tt.id}
                    whileHover={{ scale: 1.01 }}
                    className="bg-card border border-border/60 rounded-2xl p-5 space-y-3 cursor-pointer"
                    onClick={() => setSelectedType(tt)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-extrabold text-lg">{tt.name}</p>
                        {tt.description && <p className="text-sm text-muted-foreground mt-0.5">{tt.description}</p>}
                      </div>
                      <p className="text-2xl font-black text-primary">{tt.priceCfa.toLocaleString()} <span className="text-xs font-bold text-muted-foreground">XOF</span></p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={remaining > 0 ? "default" : "destructive"}>
                        {remaining > 0 ? `${remaining} ${isEn ? "remaining" : "restants"}` : isEn ? "Sold out" : "Épuisé"}
                      </Badge>
                      {tt.maxPerPerson < 100 && <span>· max {tt.maxPerPerson}/{isEn ? "person" : "personne"}</span>}
                    </div>
                  </motion.div>
                );
              })}
              {ticketTypes.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="font-semibold">{isEn ? "No tickets available" : "Aucun billet disponible"}</p>
                </div>
              )}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border/60 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-border/30">
                <div>
                  <p className="font-extrabold text-lg">{selectedType.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedType.priceCfa.toLocaleString()} XOF / {isEn ? "ticket" : "billet"}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedType(null)}>{isEn ? "Change" : "Changer"}</Button>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Quantity" : "Quantité"}</label>
                <div className="flex items-center gap-3 mt-1">
                  <Input type="number" min={1} max={Math.min(selectedType.maxPerPerson, selectedType.quantity - selectedType._count.tickets)} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-20 text-center font-bold" />
                  <span className="text-sm font-semibold text-muted-foreground">× {selectedType.priceCfa.toLocaleString()} XOF</span>
                  <p className="text-lg font-black text-primary ml-auto">= {(quantity * selectedType.priceCfa).toLocaleString()} XOF</p>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/30 pt-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Your information" : "Vos informations"}</p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input placeholder={isEn ? "Your name (optional)" : "Votre nom (optionnel)"} value={holderName} onChange={(e) => setHolderName(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input placeholder={isEn ? "Phone number (optional)" : "Téléphone (optionnel)"} value={holderPhone} onChange={(e) => setHolderPhone(sanitizePhoneInput(e.target.value))} />
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input type="email" placeholder={isEn ? "Email (optional)" : "Email (optionnel)"} value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} />
                </div>
              </div>

              {purchaseError && <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 text-destructive text-xs border border-destructive/10"><AlertCircle className="w-4 h-4" /><p>{purchaseError}</p></div>}

              <Button size="lg" className="w-full h-14 text-base font-bold" disabled={isPurchasing} onClick={onPurchase}>
                {isPurchasing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                {isPurchasing ? (isEn ? "Processing..." : "Traitement...") : (isEn ? "Pay" : "Payer")} {(quantity * selectedType.priceCfa).toLocaleString()} XOF
              </Button>
            </motion.div>
          )}
        </>
      )}

      {purchasedTicket && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card border border-border/60 rounded-2xl p-8 space-y-6 text-center">
          <div className="rounded-full bg-emerald-500/10 p-4 border border-emerald-500/20 w-fit mx-auto">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black">{isEn ? "Purchase confirmed!" : "Achat confirmé !"}</h2>
            <p className="text-sm text-muted-foreground">{quantity} × {purchasedTicket.ticketType.name} — {(quantity * purchasedTicket.ticketType.priceCfa).toLocaleString()} XOF</p>
          </div>

          <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{isEn ? "Ticket type" : "Type"}</span>
              <span className="font-bold">{purchasedTicket.ticketType.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{isEn ? "Status" : "Statut"}</span>
              <Badge>{purchasedTicket.status}</Badge>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{isEn ? "Your QR codes" : "Vos QR codes"}</p>
            {purchaseResult?.tickets.map((t) => (
              <div key={t.id} className="bg-muted/30 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground truncate mr-2">{t.id.slice(0, 12)}...</span>
                <img src={`${window.location.origin}/api/tickets/${t.id}/qr`} alt="QR" className="w-16 h-16" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              {isEn ? "Save these QR codes. You'll need them for entry." : "Conservez ces QR codes. Ils seront nécessaires pour l'entrée."}
            </p>
          </div>

          <Button variant="secondary" className="w-full" onClick={() => router.push(`/e/${slug}`)}>
            {isEn ? "Back to event" : "Retour à l'évènement"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
