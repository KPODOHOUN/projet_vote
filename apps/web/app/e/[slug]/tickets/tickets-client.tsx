"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Mail, Phone, User } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { formatCfa } from "@/lib/format";
import { useI18n } from "@/lib/i18n-provider";
import { sanitizePhoneInput } from "@/lib/phone";
import { MOBILE_NETWORKS } from "@/lib/mobile-networks";
import { usePublicTicketTypes, type PublicTicketType } from "@/lib/hooks/use-public-tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState, StatusChip } from "@/components/ui/primitives";

/**
 * Vente ouverte par défaut : l'achat passe par le circuit de paiement des votes
 * (push Mobile Money puis confirmation serveur). NEXT_PUBLIC_TICKET_SALES_OPEN=false
 * permet de la fermer sans redéployer l'API.
 */
const TICKET_SALES_OPEN = process.env.NEXT_PUBLIC_TICKET_SALES_OPEN !== "false";
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_TRIES = 60;

type PurchaseResult = {
  tickets: { id: string; qrSecret: string; amountCfa: number }[];
  transaction: { id: string; amountCfa: number; status: string; statusToken: string };
};

type PurchaseStatus = { status: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ticketUrl = (id: string, secret: string) => `/public/tickets/${id}?s=${encodeURIComponent(secret)}`;

type TicketInfo = {
  id: string;
  qrSecret: string;
  amountCfa: number;
  ticketType: { name: string; priceCfa: number };
  event: { title: string; slug: string };
  status: string;
  holderName: string | null;
};

export function TicketsClient({ slug, paymentNetworks }: { slug: string; paymentNetworks?: string[] | undefined }) {
  const router = useRouter();
  const { locale, t } = useI18n();

  const { data: ticketTypes = [], isLoading, error } = usePublicTicketTypes(slug);

  const [selectedType, setSelectedType] = useState<PublicTicketType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [holderName, setHolderName] = useState("");
  const [holderPhone, setHolderPhone] = useState("");
  const [holderEmail, setHolderEmail] = useState("");
  // Réseau obligatoire : deviner l'opérateur d'après le numéro peut viser le mauvais réseau.
  const [operator, setOperator] = useState("");
  const networks = paymentNetworks ? MOBILE_NETWORKS.filter((network) => paymentNetworks.includes(network.value)) : MOBILE_NETWORKS;
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [purchasedTicket, setPurchasedTicket] = useState<TicketInfo | null>(null);
  const [isWaitingPayment, setIsWaitingPayment] = useState(false);
  const phoneReady = holderPhone.replace(/\D/g, "").length >= 8;

  const statusLabel = (status: string) =>
    status === "PAID" || status === "CONFIRMED"
      ? t("pub.ticketStatusPaid")
      : status === "USED"
        ? t("pub.ticketStatusUsed")
        : status === "CANCELLED" || status === "REFUNDED"
          ? t("pub.ticketStatusCancelled")
          : t("pub.ticketStatusReserved");

  async function waitForPayment(result: PurchaseResult): Promise<string> {
    let status = result.transaction.status;
    for (let i = 0; status === "PENDING" && i < POLL_MAX_TRIES; i++) {
      await sleep(POLL_INTERVAL_MS);
      const res = await apiFetch<PurchaseStatus>(`/public/events/${slug}/tickets/purchase-status`, {
        method: "POST",
        body: JSON.stringify({ transactionId: result.transaction.id, statusToken: result.transaction.statusToken })
      });
      status = res.status;
    }
    return status;
  }

  async function onPurchase() {
    if (!selectedType || !phoneReady) return;
    setIsPurchasing(true);
    setPurchaseError("");
    try {
      const result = await apiFetch<PurchaseResult>(`/public/events/${slug}/tickets/purchase`, {
        method: "POST",
        body: JSON.stringify({
          ticketTypeId: selectedType.id,
          quantity,
          holderName: holderName || undefined,
          holderPhone,
          operator,
          holderEmail: holderEmail || undefined
        })
      });
      setPurchaseResult(result);
      setIsWaitingPayment(result.transaction.status === "PENDING");
      const finalStatus = await waitForPayment(result);
      setIsWaitingPayment(false);
      if (finalStatus !== "SUCCEEDED") {
        setPurchaseError(t("pub.paymentFailed"));
        return;
      }
      const first = result.tickets[0];
      if (first) {
        setPurchasedTicket(await apiFetch<TicketInfo>(ticketUrl(first.id, first.qrSecret)));
      }
    } catch (err) {
      setIsWaitingPayment(false);
      setPurchaseError(err instanceof Error ? err.message : t("pub.purchaseError"));
    } finally {
      setIsPurchasing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {isLoading ? (
        <LoadingState variant="rows" count={3} />
      ) : error ? (
        <FormError>{error instanceof Error ? error.message : t("pub.loadError")}</FormError>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--mini-ink)]">
            {TICKET_SALES_OPEN ? t("pub.buyTickets") : t("pub.ticketsTitle")}
          </h1>

          {!TICKET_SALES_OPEN ? (
            <p role="status" className="rounded-md border border-border bg-muted px-4 py-3 text-sm font-medium text-foreground">
              {t("pub.ticketSalesClosed")}
            </p>
          ) : null}

          {!purchasedTicket && (
            <>
              {!selectedType ? (
                <div className="space-y-4">
                  {ticketTypes.map((tt) => {
                    const sold = tt._count.tickets;
                    const remaining = tt.quantity - sold;
                    return (
                      <div
                        key={tt.id}
                        className={`space-y-3 rounded-md border border-border/60 bg-card p-5${TICKET_SALES_OPEN ? " cursor-pointer hover:bg-accent/40" : ""}`}
                        {...(TICKET_SALES_OPEN
                          ? {
                              role: "button",
                              tabIndex: 0,
                              onClick: () => setSelectedType(tt),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedType(tt);
                                }
                              },
                            }
                          : {})}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-lg font-extrabold">{tt.name}</p>
                            {tt.description && <p className="mt-0.5 text-sm text-muted-foreground">{tt.description}</p>}
                          </div>
                          <p className="whitespace-nowrap text-xl font-extrabold text-[var(--mini-ink)] tabular-nums">
                            {formatCfa(tt.priceCfa, locale)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={remaining > 0 ? "default" : "destructive"}>
                            {remaining > 0 ? t("pub.remainingCount", { count: remaining }) : t("pub.soldOut")}
                          </Badge>
                          {tt.maxPerPerson < 100 && <span>· {t("pub.maxPerPerson", { count: tt.maxPerPerson })}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {ticketTypes.length === 0 && (
                    <EmptyState title={t("pub.noTickets")} description={t("pub.noTicketsDesc")} />
                  )}
                </div>
              ) : TICKET_SALES_OPEN ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  data-zone="secure-flow"
                  className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-border/30 pb-3">
                    <div>
                      <p className="text-lg font-extrabold">{selectedType.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCfa(selectedType.priceCfa, locale)} / {t("pub.perTicket")}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setSelectedType(null)}>
                      {t("pub.change")}
                    </Button>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("pub.quantity")}
                    </label>
                    <div className="mt-1 flex items-center gap-3">
                      <Input
                        type="number"
                        min={1}
                        max={Math.min(selectedType.maxPerPerson, selectedType.quantity - selectedType._count.tickets)}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                        className="h-11 w-20 text-center font-bold"
                      />
                      <span className="text-sm font-semibold text-muted-foreground">
                        × {formatCfa(selectedType.priceCfa, locale)}
                      </span>
                      <p className="ml-auto text-lg font-black text-primary">
                        = {formatCfa(quantity * selectedType.priceCfa, locale)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-border/30 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("pub.yourInfo")}</p>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <Input
                        className="h-11"
                        placeholder={t("pub.nameOptional")}
                        value={holderName}
                        onChange={(e) => setHolderName(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <Input
                        className="h-11"
                        placeholder={t("pub.phoneMomo")}
                        aria-label={t("pub.phoneMomo")}
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        value={holderPhone}
                        onChange={(e) => setHolderPhone(sanitizePhoneInput(e.target.value))}
                      />
                    </div>
                    <select
                      aria-label={t("pay.network")}
                      required
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="" disabled>
                        {t("pub.operatorPick")}
                      </option>
                      {networks.map((network) => (
                        <option key={network.value} value={network.value}>
                          {network.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <Input
                        className="h-11"
                        type="email"
                        placeholder={t("pub.emailOptional")}
                        value={holderEmail}
                        onChange={(e) => setHolderEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  {isWaitingPayment ? (
                    <div role="status" aria-live="polite" className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                      <p className="font-semibold text-foreground">{t("pub.waitingPayment")}</p>
                      <p className="mt-1 text-muted-foreground">{t("pub.waitingPaymentHint")}</p>
                    </div>
                  ) : null}

                  <FormError>{purchaseError}</FormError>

                  <Button
                    size="lg"
                    loading={isPurchasing}
                    disabled={isPurchasing || !phoneReady || operator === ""}
                    onClick={onPurchase}
                    className="h-14 w-full text-base font-bold"
                  >
                    {isPurchasing
                      ? t("pub.processing")
                      : `${t("pub.pay")} ${formatCfa(quantity * selectedType.priceCfa, locale)}`}
                  </Button>
                </motion.div>
              ) : null}
            </>
          )}

          {purchasedTicket && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 rounded-2xl border border-border/60 bg-card p-8 text-center"
            >
              <div className="mx-auto w-fit rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-4">
                <CheckCircle2 className="h-12 w-12 text-[var(--color-success)]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black">{t("pub.purchaseConfirmed")}</h2>
                <p className="text-sm text-muted-foreground">
                  {quantity} × {purchasedTicket.ticketType.name} —{" "}
                  {formatCfa(quantity * purchasedTicket.ticketType.priceCfa, locale)}
                </p>
              </div>

              <div className="space-y-2 rounded-xl bg-muted/40 p-4 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("pub.ticketType")}</span>
                  <span className="font-bold">{purchasedTicket.ticketType.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("pub.statusLabel")}</span>
                  <StatusChip
                    tone={purchasedTicket.status === "PAID" || purchasedTicket.status === "CONFIRMED" ? "success" : "pending"}
                    label={statusLabel(purchasedTicket.status)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("pub.qrTitle")}</p>
                {purchaseResult?.tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
                    <span className="mr-2 truncate font-mono text-xs text-muted-foreground">
                      {ticket.id.slice(0, 12)}...
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- QR généré à la volée par l'API : ni optimisation ni cache next/image */}
                    <img
                      src={`/api/tickets/${ticket.id}/qr?s=${encodeURIComponent(ticket.qrSecret)}`}
                      alt={t("pub.qrAlt", { id: ticket.id.slice(0, 8) })}
                      width={64}
                      height={64}
                      className="h-16 w-16"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">{t("pub.qrNote")}</p>
              </div>

              <Button variant="secondary" className="w-full" onClick={() => router.push(`/e/${slug}`)}>
                {t("pub.backToEvent")}
              </Button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
