"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n-provider";
import { formatCfa } from "../../../lib/format";
import { Button, Card, Badge, LoadingState } from "@/components/ui";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, Ticket, ShieldCheck } from "lucide-react";
import { getStoredToken } from "../../../lib/auth";
import { authLoginUrl } from "../../../lib/auth-navigation";
import { TicketShareActions } from "../../../components/tickets/ticket-share-actions";

export type TicketDetail = {
  id: string;
  number: number | null;
  status: string;
  holderName: string | null;
  qrSecret: string;
  amountCfa: number;
  ticketType: { name: string; priceCfa: number };
  event: { title: string; slug: string };
};

/**
 * Image du billet (rendue côté serveur en quelques secondes). Toujours visible :
 * un indicateur la recouvre tant qu'elle charge. L'image peut finir de charger
 * avant l'hydratation (rendu serveur + préchargement) : on lit alors `complete`.
 */
function DesignedTicketImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, []);
  return (
    <div className={`relative overflow-hidden rounded-xl bg-muted ${loaded ? "" : "min-h-32"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- image du billet rendue par /t/[id]/image (URL porteuse du secret) */}
      <img ref={imageRef} src={src} alt={alt} onLoad={() => setLoaded(true)} className="block w-full rounded-xl shadow-md" />
      {!loaded ? (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}

// useSearchParams exige une boundary Suspense au prerender (le layout racine
// n'en fournit plus — voir AuthModalUrlSync).
export function TicketValidationPage({ initialTicket }: { initialTicket: TicketDetail | null }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <TicketValidationContent initialTicket={initialTicket} />
    </Suspense>
  );
}

function TicketValidationContent({ initialTicket }: { initialTicket: TicketDetail | null }) {
  const params = useParams<{ ticketId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, locale } = useI18n();
  const ticketId = params.ticketId;
  const secret = searchParams.get("s");

  // Billet lu par le serveur : affiché (image comprise) dès le premier écran.
  const [ticket, setTicket] = useState<TicketDetail | null>(initialTicket);
  const [isLoading, setIsLoading] = useState(initialTicket === null);
  const [error, setError] = useState("");
  const [validationResult, setValidationResult] = useState<{ valid: boolean; ticket?: { id: string; status: string; holderName: string | null; ticketType: string; event: string } } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState("");

  useEffect(() => {
    if (initialTicket) return;
    async function load() {
      try {
        const data = await apiFetch<TicketDetail>(`/public/tickets/${ticketId}?s=${encodeURIComponent(secret ?? "")}`);
        setTicket(data);
      } catch (err) {
        // Message vide : l'écran d'erreur affiche alors « Billet introuvable ».
        setError(err instanceof Error ? err.message : "");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [ticketId, secret, initialTicket]);

  async function onValidate() {
    setIsValidating(true);
    setValidateError("");
    try {
      const token = getStoredToken();
      if (!token) {
        router.push(authLoginUrl(`/t/${ticketId}?s=${encodeURIComponent(secret ?? "")}`));
        return;
      }
      const result = await apiFetch<typeof validationResult>("/tickets/validate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, secret })
      });
      setValidationResult(result);
    } catch (err) {
      setValidateError(err instanceof Error ? err.message : t("ticket.validateError"));
    } finally {
      setIsValidating(false);
    }
  }

  if (isLoading) return <main id="main-content" className="min-h-screen flex items-center justify-center"><LoadingState variant="form" count={3} /></main>;

  if (error || !ticket) {
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md gap-4 p-8 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
          <h1 className="text-xl font-black">{t("ticket.invalid")}</h1>
          <p className="text-sm text-muted-foreground">{error || t("ticket.notFound")}</p>
        </Card>
      </main>
    );
  }

  const isValid = ticket.status === "PAID" || ticket.status === "CONFIRMED";
  // Billet dessiné par l'organisateur, rendu pour cet acheteur (nom, type, QR code).
  const designedTicketUrl = `/t/${encodeURIComponent(ticket.id)}/image?s=${encodeURIComponent(secret ?? "")}`;

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
        <Card className="gap-6 p-5 text-center sm:p-8">
          {isValid || ticket.status === "USED" ? (
            <div className="space-y-3">
              <DesignedTicketImage src={designedTicketUrl} alt={t("ticket.designedAlt")} />
              <TicketShareActions
                ticketId={ticket.id}
                secret={secret ?? ""}
                holderName={ticket.holderName}
                eventTitle={ticket.event.title}
                isEn={locale === "en"}
                showView={false}
              />
            </div>
          ) : (
            <Ticket className="w-12 h-12 mx-auto text-primary" />
          )}
          <div className="space-y-1">
            <h1 className="text-xl font-black">{ticket.event.title}</h1>
            <p className="text-sm text-muted-foreground">{ticket.ticketType.name}</p>
          </div>

          <dl className="divide-y divide-border/60 rounded-xl border border-border/60 text-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{t("ticket.status")}</dt>
              <dd>
                <Badge variant={isValid ? "default" : ticket.status === "USED" ? "secondary" : "destructive"}>
                  {isValid
                    ? t("pub.ticketStatusPaid")
                    : ticket.status === "USED"
                      ? t("pub.ticketStatusUsed")
                      : ticket.status === "CANCELLED" || ticket.status === "REFUNDED"
                        ? t("pub.ticketStatusCancelled")
                        : t("pub.ticketStatusReserved")}
                </Badge>
              </dd>
            </div>
            {ticket.number ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">{locale === "en" ? "Number" : "Numéro"}</dt>
                <dd className="font-bold tabular-nums">N° {String(ticket.number).padStart(4, "0")}</dd>
              </div>
            ) : null}
            {ticket.holderName ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">{t("ticket.holder")}</dt>
                <dd className="min-w-0 truncate font-bold">{ticket.holderName}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{t("ticket.price")}</dt>
              <dd className="font-bold tabular-nums">{formatCfa(ticket.amountCfa, locale)}</dd>
            </div>
          </dl>

          {!validationResult && (
            <>
              {ticket.status === "RESERVED" ? (
                // Paiement Mobile Money encore en cours : rassurer, pas alarmer.
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-bold text-amber-900">{t("ticket.paymentPending")}</p>
                  <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>{t("ticket.refresh")}</Button>
                </div>
              ) : !isValid && ticket.status !== "USED" ? (
                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
                  <p className="text-sm font-bold text-destructive">{ticket.status === "CANCELLED" ? t("ticket.expired") : t("ticket.notPaid")}</p>
                </div>
              ) : ticket.status === "USED" ? (
                <div className="p-4 rounded-xl bg-muted border border-border/50 text-center">
                  <p className="text-sm font-bold text-muted-foreground">{t("ticket.alreadyUsed")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {locale === "en"
                      ? "Show this QR code at the entrance. It is valid for one entry only: do not share it."
                      : "Présentez ce QR code à l'entrée. Il n'est valable que pour une entrée : ne le partagez pas."}
                  </p>
                  {/* Réservé à l'équipe de l'organisateur (connexion exigée) ; le scanner du tableau de bord est plus rapide. */}
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onValidate} disabled={isValidating}>
                    {isValidating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    {isValidating ? t("ticket.validating") : locale === "en" ? "Organizer: validate entry" : "Organisateur : valider l'entrée"}
                  </Button>
                </div>
              )}
            </>
          )}

          {validationResult && validationResult.valid && (
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="p-6 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
              <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--color-success)]" />
              <p className="font-black text-lg text-[var(--color-success-text)]">{t("ticket.entryValidated")}</p>
              <p className="text-sm text-muted-foreground">
                {validationResult.ticket?.holderName && `${validationResult.ticket.holderName} · `}
                {validationResult.ticket?.ticketType}
              </p>
            </motion.div>
          )}

          {validateError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 text-destructive text-xs border border-destructive/10">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>{validateError}</p>
            </div>
          )}

          <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
            {locale === "en" ? "Reference" : "Référence"} <span className="font-mono">{ticket.id}</span>
          </p>
        </Card>
      </motion.div>
    </main>
  );
}
