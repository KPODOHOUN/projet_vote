"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Ticket } from "lucide-react";

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
import { EmptyState } from "@/components/ui/primitives";
import { TicketShareActions } from "@/components/tickets/ticket-share-actions";
import { clearMyTickets, readMyTickets, saveMyTickets, type MyTicket } from "@/lib/my-tickets";

/**
 * Vente ouverte par défaut : l'achat passe par le circuit de paiement des votes
 * (push Mobile Money puis confirmation serveur). NEXT_PUBLIC_TICKET_SALES_OPEN=false
 * permet de la fermer sans redéployer l'API.
 */
const TICKET_SALES_OPEN = process.env.NEXT_PUBLIC_TICKET_SALES_OPEN !== "false";
const sectionLabel = "text-xs font-bold uppercase tracking-wider text-muted-foreground";

/** Champ avec libellé visible au-dessus : tous les champs partagent le même bord gauche. */
function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
        {label}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_TRIES = 60;

type PurchaseResult = {
  tickets: { id: string; qrSecret: string; amountCfa: number }[];
  transaction: { id: string; amountCfa: number; status: string; statusToken: string };
};

type PurchaseStatus = { status: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function TicketsClient({
  slug,
  eventTitle,
  paymentNetworks,
  previewToken,
  initialTicketTypes
}: {
  slug: string;
  eventTitle: string;
  paymentNetworks?: string[] | undefined;
  /** Aperçu d'un brouillon par son organisateur. */
  previewToken?: string | undefined;
  /** Liste lue par le serveur au rendu de la page (null si l'API n'a pas répondu). */
  initialTicketTypes?: PublicTicketType[] | null;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const isEn = locale === "en";

  const { data: ticketTypes = [], isLoading, error } = usePublicTicketTypes(slug, previewToken, initialTicketTypes ?? undefined);

  const [selectedType, setSelectedType] = useState<PublicTicketType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [holderName, setHolderName] = useState("");
  // Nom sur chaque billet (facultatif) : un achat pour un groupe porte le nom de chaque invité.
  const [guests, setGuests] = useState<string[]>([]);
  const [holderPhone, setHolderPhone] = useState("");
  const [holderEmail, setHolderEmail] = useState("");
  // Réseau obligatoire : deviner l'opérateur d'après le numéro peut viser le mauvais réseau.
  const [operator, setOperator] = useState("");
  const networks = paymentNetworks ? MOBILE_NETWORKS.filter((network) => paymentNetworks.includes(network.value)) : MOBILE_NETWORKS;
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [confirmed, setConfirmed] = useState<MyTicket[] | null>(null);
  const [stillPending, setStillPending] = useState(false);
  const [isWaitingPayment, setIsWaitingPayment] = useState(false);
  // Billets achetés sur cet appareil : retrouvables sans e-mail ni compte.
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  useEffect(() => setMyTickets(readMyTickets(slug)), [slug]);
  const phoneReady = holderPhone.replace(/\D/g, "").length >= 8;

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
    setStillPending(false);
    try {
      const names = Array.from({ length: quantity }, (_, i) => (guests[i] ?? "").trim());
      const result = await apiFetch<PurchaseResult>(`/public/events/${slug}/tickets/purchase`, {
        method: "POST",
        body: JSON.stringify({
          ticketTypeId: selectedType.id,
          quantity,
          holderName: holderName.trim() || undefined,
          holderPhone,
          operator,
          holderEmail: holderEmail.trim() || undefined,
          ...(quantity > 1 ? { guests: names } : {})
        })
      });
      // Gardés sur l'appareil dès l'achat : même si la page se ferme pendant le
      // paiement, l'acheteur retrouve ses billets ici.
      const bought: MyTicket[] = result.tickets.map((ticket, i) => ({
        id: ticket.id,
        secret: ticket.qrSecret,
        holderName: (quantity > 1 ? names[i] : "") || holderName.trim() || null,
        ticketTypeName: selectedType.name,
        boughtAt: new Date().toISOString()
      }));
      setMyTickets(saveMyTickets(slug, bought));
      setIsWaitingPayment(result.transaction.status === "PENDING");
      const finalStatus = await waitForPayment(result);
      setIsWaitingPayment(false);
      if (finalStatus === "SUCCEEDED") {
        setConfirmed(bought);
      } else if (finalStatus === "PENDING") {
        // Mobile Money encore en cours : ce n'est pas un échec.
        setStillPending(true);
      } else {
        setPurchaseError(t("pub.paymentFailed"));
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

          {!confirmed && myTickets.length > 0 && !selectedType ? (
            <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="my-tickets-title">
              <h2 id="my-tickets-title" className="flex items-center gap-2 text-sm font-extrabold">
                <Ticket className="h-4 w-4" aria-hidden="true" />
                {isEn ? `My tickets on this phone (${myTickets.length})` : `Mes billets sur ce téléphone (${myTickets.length})`}
              </h2>
              <ul className="space-y-3">
                {myTickets.map((ticket) => (
                  <li key={ticket.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                    <p className="text-sm font-bold">{ticket.ticketTypeName} · {ticket.holderName ?? (isEn ? "No name" : "Sans nom")}</p>
                    <TicketShareActions ticketId={ticket.id} secret={ticket.secret} holderName={ticket.holderName} eventTitle={eventTitle} isEn={isEn} />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="text-xs font-semibold text-muted-foreground underline"
                onClick={() => {
                  const confirmed = window.confirm(
                    isEn
                      ? "Remove these tickets from this phone? They stay valid; keep their links or emails."
                      : "Retirer ces billets de ce téléphone ? Ils restent valables : gardez leurs liens ou e-mails."
                  );
                  if (confirmed) { clearMyTickets(slug); setMyTickets([]); }
                }}
              >
                {isEn ? "Remove these tickets from this phone (shared phone)" : "Retirer ces billets de ce téléphone (téléphone partagé)"}
              </button>
            </section>
          ) : null}

          {!confirmed && (
            <>
              {!selectedType ? (
                <div className="space-y-4">
                  {ticketTypes.map((tt) => {
                    const sold = tt._count.tickets;
                    const remaining = tt.quantity - sold;
                    return (
                      <div
                        key={tt.id}
                        className={`flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-5 transition-colors${TICKET_SALES_OPEN ? " cursor-pointer hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`}
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
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-lg font-extrabold leading-tight">{tt.name}</p>
                          {tt.description && <p className="text-sm text-muted-foreground">{tt.description}</p>}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <Badge variant={remaining > 0 ? "default" : "destructive"}>
                              {remaining > 0 ? t("pub.remainingCount", { count: remaining }) : t("pub.soldOut")}
                            </Badge>
                            {tt.maxPerPerson < 100 && <span>{t("pub.maxPerPerson", { count: tt.maxPerPerson })}</span>}
                          </div>
                        </div>
                        <p className="whitespace-nowrap text-lg font-extrabold tabular-nums text-[var(--mini-ink)] sm:text-xl">
                          {formatCfa(tt.priceCfa, locale)}
                        </p>
                        {TICKET_SALES_OPEN ? <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
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
                  className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
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

                  <div className="space-y-2">
                    <label htmlFor="ticket-quantity" className={sectionLabel}>
                      {t("pub.quantity")}
                    </label>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Input
                        id="ticket-quantity"
                        type="number"
                        min={1}
                        max={Math.min(selectedType.maxPerPerson, selectedType.quantity - selectedType._count.tickets)}
                        value={quantity}
                        onChange={(e) => {
                          const next = Math.max(1, Math.min(selectedType.maxPerPerson, Number(e.target.value) || 1));
                          setQuantity(next);
                          setGuests((current) => current.slice(0, next));
                        }}
                        className="h-11 w-20 text-center font-bold"
                      />
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-muted-foreground">
                        × {formatCfa(selectedType.priceCfa, locale)}
                      </span>
                      <p className="ml-auto whitespace-nowrap text-lg font-black tabular-nums text-primary">
                        {formatCfa(quantity * selectedType.priceCfa, locale)}
                      </p>
                    </div>
                  </div>

                  <div role="group" aria-labelledby="ticket-info-title" className="space-y-4 border-t border-border/40 pt-5">
                    <p id="ticket-info-title" className={sectionLabel}>{t("pub.yourInfo")}</p>
                    <div className="space-y-4">
                      <Field id="ticket-phone" label={t("pub.phoneMomo")}>
                        <Input
                          id="ticket-phone"
                          className="h-11"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          value={holderPhone}
                          onChange={(e) => setHolderPhone(sanitizePhoneInput(e.target.value))}
                        />
                      </Field>
                      <Field id="ticket-network" label={t("pay.network")}>
                        <select
                          id="ticket-network"
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
                      </Field>
                      <Field id="ticket-name" label={isEn ? "Your name" : "Votre nom"} hint={isEn ? "optional" : "facultatif"}>
                        <Input id="ticket-name" className="h-11" autoComplete="name" value={holderName} onChange={(e) => setHolderName(e.target.value)} />
                      </Field>
                      <Field
                        id="ticket-email"
                        label={isEn ? "Email" : "E-mail"}
                        hint={isEn ? "recommended: your tickets are sent there" : "recommandé : vos billets y sont envoyés"}
                      >
                        <Input id="ticket-email" className="h-11" type="email" autoComplete="email" value={holderEmail} onChange={(e) => setHolderEmail(e.target.value)} />
                      </Field>
                    </div>
                  </div>

                  {quantity > 1 ? (
                    <div role="group" aria-labelledby="ticket-guests-title" className="space-y-4 border-t border-border/40 pt-5">
                      <div className="space-y-1">
                        <p id="ticket-guests-title" className={sectionLabel}>
                          {isEn ? "Name on each ticket" : "Nom sur chaque billet"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isEn
                            ? "Optional. Buying for friends? Each one gets a ticket with their name, to send them by WhatsApp."
                            : "Facultatif. Vous achetez pour d'autres ? Chacun aura son billet à son nom, à lui envoyer par WhatsApp."}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: quantity }, (_, i) => (
                          <Field key={i} id={`ticket-guest-${i}`} label={isEn ? `Name on ticket ${i + 1}` : `Nom sur le billet ${i + 1}`}>
                            <Input
                              id={`ticket-guest-${i}`}
                              className="h-11"
                              maxLength={120}
                              placeholder={i === 0 && holderName.trim() ? holderName.trim() : undefined}
                              value={guests[i] ?? ""}
                              onChange={(e) => setGuests((current) => {
                                const next = [...current];
                                next[i] = e.target.value;
                                return next;
                              })}
                            />
                          </Field>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {isWaitingPayment ? (
                    <div role="status" aria-live="polite" className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                      <p className="font-semibold text-foreground">{t("pub.waitingPayment")}</p>
                      <p className="mt-1 text-muted-foreground">{t("pub.waitingPaymentHint")}</p>
                    </div>
                  ) : null}

                  {stillPending ? (
                    <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      {isEn
                        ? "Your payment is still being processed by Mobile Money. Your tickets are saved on this phone (« My tickets ») and become valid as soon as the payment is confirmed."
                        : "Votre paiement est encore en cours chez Mobile Money. Vos billets sont gardés sur ce téléphone (« Mes billets ») et deviennent valables dès la confirmation du paiement."}
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

          {confirmed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6 rounded-2xl border border-border/60 bg-card p-6 text-center sm:p-8"
            >
              <div className="mx-auto w-fit rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-4">
                <CheckCircle2 className="h-12 w-12 text-[var(--color-success)]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black">{t("pub.purchaseConfirmed")}</h2>
                <p className="text-sm text-muted-foreground">
                  {confirmed.length} × {confirmed[0]?.ticketTypeName}
                  {selectedType ? ` — ${formatCfa(confirmed.length * selectedType.priceCfa, locale)}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEn
                    ? "Each ticket has its own QR code, valid once. Send each guest their ticket — they can show it on their phone or printed."
                    : "Chaque billet a son propre QR code, valable une fois. Envoyez à chaque invité son billet : il le présente sur son téléphone ou imprimé."}
                </p>
              </div>

              <ul className="space-y-3 text-left">
                {confirmed.map((ticket, i) => (
                  <li key={ticket.id} className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                    <p className="text-sm font-bold">
                      {isEn ? "Ticket" : "Billet"} {i + 1} · {ticket.holderName ?? (isEn ? "No name" : "Sans nom")}
                    </p>
                    <TicketShareActions ticketId={ticket.id} secret={ticket.secret} holderName={ticket.holderName} eventTitle={eventTitle} isEn={isEn} />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {isEn
                  ? "Your tickets stay available on this page from this phone (« My tickets »)."
                  : "Vos billets restent disponibles sur cette page depuis ce téléphone (« Mes billets »)."}
              </p>

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
