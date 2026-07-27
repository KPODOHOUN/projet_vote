"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n-provider";
import { Button, Card, Badge, LoadingState } from "@/components/ui";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, Ticket, User, ShieldCheck } from "lucide-react";
import { getStoredToken } from "../../../lib/auth";

type TicketDetail = {
  id: string;
  status: string;
  holderName: string | null;
  qrSecret: string;
  amountCfa: number;
  ticketType: { name: string; priceCfa: number };
  event: { title: string; slug: string };
};

export default function TicketValidationPage() {
  const params = useParams<{ ticketId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const ticketId = params.ticketId;
  const secret = searchParams.get("s");

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [validationResult, setValidationResult] = useState<{ valid: boolean; ticket?: { id: string; status: string; holderName: string | null; ticketType: string; event: string } } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<TicketDetail>(`/public/tickets/${ticketId}`);
        setTicket(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ticket introuvable");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [ticketId]);

  async function onValidate() {
    setIsValidating(true);
    setValidateError("");
    try {
      const token = getStoredToken();
      if (!token) {
        router.push(`/login?redirect=/t/${ticketId}?s=${secret}`);
        return;
      }
      const result = await apiFetch<typeof validationResult>("/tickets/validate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, secret })
      });
      setValidationResult(result);
    } catch (err) {
      setValidateError(err instanceof Error ? err.message : "Erreur de validation");
    } finally {
      setIsValidating(false);
    }
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingState variant="form" count={3} /></div>;

  if (error || !ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
          <h1 className="text-xl font-black">{isEn ? "Invalid ticket" : "Ticket invalide"}</h1>
          <p className="text-sm text-muted-foreground">{error || (isEn ? "Ticket not found" : "Ticket introuvable")}</p>
        </Card>
      </div>
    );
  }

  const isValid = ticket.status === "PAID" || ticket.status === "CONFIRMED";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/30">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
        <Card className="p-8 space-y-6 text-center">
          <Ticket className="w-12 h-12 mx-auto text-primary" />
          <div className="space-y-1">
            <h1 className="text-xl font-black">{ticket.event.title}</h1>
            <p className="text-sm text-muted-foreground">{ticket.ticketType.name}</p>
          </div>

          <div className="bg-muted/40 rounded-xl p-4 space-y-3 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{isEn ? "Status" : "Statut"}</span>
              <Badge variant={isValid ? "default" : ticket.status === "USED" ? "secondary" : "destructive"}>{ticket.status}</Badge>
            </div>
            {ticket.holderName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground"><User className="w-3 h-3 inline mr-1" />{isEn ? "Holder" : "Titulaire"}</span>
                <span className="font-bold">{ticket.holderName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{isEn ? "Price" : "Prix"}</span>
              <span className="font-bold">{ticket.amountCfa.toLocaleString()} XOF</span>
            </div>
          </div>

          {!validationResult && (
            <>
              {!isValid && ticket.status !== "USED" ? (
                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
                  <p className="text-sm font-bold text-destructive">{isEn ? "This ticket is not yet paid" : "Ce billet n'est pas encore payé"}</p>
                </div>
              ) : ticket.status === "USED" ? (
                <div className="p-4 rounded-xl bg-muted border border-border/50 text-center">
                  <p className="text-sm font-bold text-muted-foreground">{isEn ? "This ticket was already used" : "Ce billet a déjà été utilisé"}</p>
                </div>
              ) : (
                <Button size="lg" className="w-full h-14 text-base font-bold" onClick={onValidate} disabled={isValidating}>
                  {isValidating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ShieldCheck className="w-5 h-5 mr-2" />}
                  {isValidating ? (isEn ? "Validating..." : "Validation...") : (isEn ? "Validate entry" : "Valider l'entrée")}
                </Button>
              )}
            </>
          )}

          {validationResult && validationResult.valid && (
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="p-6 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
              <p className="font-black text-lg text-emerald-600 dark:text-emerald-400">{isEn ? "Entry validated!" : "Entrée validée !"}</p>
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

          <div className="text-[10px] text-muted-foreground font-mono">{ticket.id}</div>
        </Card>
      </motion.div>
    </div>
  );
}
