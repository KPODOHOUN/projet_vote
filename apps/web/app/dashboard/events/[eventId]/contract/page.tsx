"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileSignature } from "lucide-react";
import { authedFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-provider";
import { showToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";
import { formatEventStatus } from "@/lib/i18n";
import {
  contractPdfPath,
  downloadContractPdf,
  generateContract,
  getContractOverview,
  sendSignatureCode,
  signContract,
  type ContractIdentity,
  type ContractOverview,
  type ContractWithContent
} from "@/lib/contracts";
import { Button, Card, FormError, Input, LoadingState } from "@/components/ui";
import { EventDashboardShell } from "@/components/event-dashboard-shell";
import { SignaturePad } from "@/components/signature-pad";

type EventInfo = { id: string; title: string; slug: string; status: string };

const EMPTY_IDENTITY: ContractIdentity = {
  firstName: "",
  lastName: "",
  phone: "",
  address: "",
  idDocumentType: "",
  idDocumentNumber: "",
  organizationName: "",
  organizationLegalId: null
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error ? error.message || fallback : fallback;

export default function EventContractPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { locale } = useI18n();
  const isEn = locale === "en";
  const { role } = useAuth();
  const canSign = role === "ORGANIZER_OWNER";

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [overview, setOverview] = useState<ContractOverview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [identity, setIdentity] = useState<ContractIdentity>(EMPTY_IDENTITY);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState("");

  const [readToEnd, setReadToEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [signing, setSigning] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [info, data] = await Promise.all([
        authedFetch<EventInfo>(`/events/${encodeURIComponent(eventId)}`),
        getContractOverview(eventId)
      ]);
      setEvent(info);
      setOverview(data);
      setIdentity((current) => (current === EMPTY_IDENTITY ? { ...EMPTY_IDENTITY, ...data.prefill, organizationLegalId: data.prefill.organizationLegalId ?? null } : current));
    } catch (error) {
      setLoadError(
        error instanceof ApiError && error.status === 404
          ? isEn ? "Contest not found." : "Concours introuvable."
          : errorMessage(error, isEn ? "Loading failed." : "Le chargement a échoué.")
      );
    }
  }, [eventId, isEn]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = overview?.current ?? null;
  const pending = current?.status === "PENDING_SIGNATURE" ? current : null;
  const signed = current?.status === "SIGNED" ? current : null;

  // Le contrat doit être lu jusqu'au bout avant de pouvoir être accepté.
  useEffect(() => {
    setReadToEnd(false);
    setAccepted(false);
    const reader = readerRef.current;
    if (reader && reader.scrollHeight <= reader.clientHeight + 4) setReadToEnd(true);
  }, [pending?.id]);

  const onReaderScroll = () => {
    const reader = readerRef.current;
    if (reader && reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 24) setReadToEnd(true);
  };

  const submitIdentity = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setGenerating(true);
    setActionError("");
    try {
      await generateContract(eventId, { ...identity, organizationLegalId: identity.organizationLegalId?.trim() || null });
      setEditingIdentity(false);
      setCodeSent(false);
      setDevCode(null);
      setCode("");
      await load();
    } catch (error) {
      setActionError(errorMessage(error, isEn ? "The contract could not be generated." : "Le contrat n'a pas pu être généré."));
    } finally {
      setGenerating(false);
    }
  };

  const requestCode = async (contract: ContractWithContent) => {
    setSendingCode(true);
    setActionError("");
    try {
      const result = await sendSignatureCode(eventId, contract.id);
      setCodeSent(true);
      setDevCode(result.devCode ?? null);
      showToast.success(isEn ? "Code sent to your email." : "Code envoyé à votre adresse email.");
    } catch (error) {
      setActionError(errorMessage(error, isEn ? "The code could not be sent." : "Le code n'a pas pu être envoyé."));
    } finally {
      setSendingCode(false);
    }
  };

  const submitSignature = async (contract: ContractWithContent) => {
    if (!accepted || code.length !== 6 || signing) return;
    setSigning(true);
    setActionError("");
    try {
      await signContract(eventId, contract.id, {
        contentHash: contract.contentHash,
        signerName,
        accept: true,
        code,
        ...(signature ? { signatureImage: signature } : {})
      });
      showToast.success(isEn ? "Contract signed. Your contest is online." : "Contrat signé. Votre concours est en ligne.");
      await load();
    } catch (error) {
      setActionError(errorMessage(error, isEn ? "The signature failed." : "La signature a échoué."));
      await load();
    } finally {
      setSigning(false);
    }
  };

  const download = async (contractId: string, isSigned: boolean) => {
    try {
      await downloadContractPdf(contractPdfPath(eventId, contractId), `contrat-${contractId}${isSigned ? "-signe" : "-projet"}.pdf`);
    } catch {
      showToast.error(isEn ? "Download failed." : "Le téléchargement a échoué.");
    }
  };

  if (loadError) return <FormError>{loadError}</FormError>;
  if (!event || !overview) return <LoadingState variant="rows" count={4} label={isEn ? "Loading the contract…" : "Chargement du contrat…"} />;

  const expectedName = pending ? `${identity.firstName} ${identity.lastName}`.trim() : "";
  const showIdentityForm = canSign && event.status === "DRAFT" && overview.requirements.length === 0 && (!pending || editingIdentity);
  const field = (key: keyof ContractIdentity) => ({
    value: identity[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setIdentity((prev) => ({ ...prev, [key]: e.target.value }))
  });

  return (
    <EventDashboardShell isEn={isEn} eventTitle={event.title} eventSlug={event.slug} eventStatus={formatEventStatus(event.status, isEn)}>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <FileSignature className="size-6 text-primary" aria-hidden="true" />
            {isEn ? "Contest contract" : "Contrat du concours"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEn
              ? "Your contest goes online when you sign this contract. It sets the commission, the reserve and how you are paid."
              : "Votre concours passe en ligne quand vous signez ce contrat. Il fixe la commission, la réserve et la façon dont vous êtes payé."}
          </p>
        </header>

        {overview.platformLegalMissing.length > 0 ? (
          <div role="alert" className="flex gap-3 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4 text-sm text-[var(--color-warning-text)]">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              {isEn
                ? "SHADOMA's legal details are not configured yet: the contract shows placeholders and signing is disabled in production."
                : "Les informations légales de SHADOMA ne sont pas encore configurées : le contrat affiche « à renseigner » et la signature est désactivée en production."}
            </p>
          </div>
        ) : null}

        {actionError ? <FormError>{actionError}</FormError> : null}

        {signed ? (
          <Card className="space-y-3 p-5">
            <p className="flex items-center gap-2 font-bold text-foreground">
              <CheckCircle2 className="size-5 text-[var(--color-success-text)]" aria-hidden="true" />
              {isEn ? "Contract signed" : "Contrat signé"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isEn ? "Signed by" : "Signé par"} {signed.signerName} — {signed.signedAt ? formatDateTime(signed.signedAt, locale) : ""}
            </p>
            <Button type="button" onClick={() => void download(signed.id, true)}>
              <Download className="mr-2 size-4" aria-hidden="true" />
              {isEn ? "Download the signed contract (PDF)" : "Télécharger le contrat signé (PDF)"}
            </Button>
          </Card>
        ) : null}

        {!signed && overview.requirements.length > 0 ? (
          <Card className="space-y-3 p-5">
            <p className="font-bold text-foreground">{isEn ? "Before the contract, complete your contest:" : "Avant le contrat, complétez votre concours :"}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {overview.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/events/${eventId}/edit`}>{isEn ? "Settings" : "Réglages"}</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/events/${eventId}/candidates`}>{isEn ? "Candidates" : "Candidats"}</Link>
              </Button>
            </div>
          </Card>
        ) : null}

        {!canSign && !signed ? (
          <p className="text-sm text-muted-foreground">
            {isEn ? "Only the account owner can sign the contract." : "Seul le titulaire du compte organisateur peut signer le contrat."}
          </p>
        ) : null}

        {showIdentityForm ? (
          <Card className="p-5">
            <form className="space-y-4" onSubmit={(e) => void submitIdentity(e)}>
              <div>
                <h2 className="text-lg font-bold">{isEn ? "Your details for the contract" : "Vos informations pour le contrat"}</h2>
                <p className="text-sm text-muted-foreground">
                  {isEn ? "They identify you as the organizer in case of dispute." : "Elles vous identifient comme organisateur en cas de litige."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={isEn ? "First name" : "Prénom"} required autoComplete="given-name" {...field("firstName")} />
                <Input label={isEn ? "Last name" : "Nom"} required autoComplete="family-name" {...field("lastName")} />
                <Input label={isEn ? "Phone" : "Téléphone"} required type="tel" autoComplete="tel" {...field("phone")} />
                <Input label={isEn ? "Organization or public name" : "Organisation ou nom public"} required {...field("organizationName")} />
                <Input label={isEn ? "Full address" : "Adresse complète"} required autoComplete="street-address" className="sm:col-span-2" {...field("address")} />
                <Input label={isEn ? "ID document type" : "Type de pièce d'identité"} required helpText={isEn ? "e.g. national ID card, passport" : "ex. carte d'identité, passeport"} {...field("idDocumentType")} />
                <Input label={isEn ? "ID document number" : "Numéro de la pièce"} required {...field("idDocumentNumber")} />
                <Input
                  label={isEn ? "Company registration (optional)" : "RCCM / IFU de la structure (facultatif)"}
                  value={identity.organizationLegalId ?? ""}
                  onChange={(e) => setIdentity((prev) => ({ ...prev, organizationLegalId: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={generating}>
                  {pending ? (isEn ? "Regenerate the contract" : "Régénérer le contrat") : isEn ? "Generate the contract" : "Générer le contrat"}
                </Button>
                {pending ? (
                  <Button type="button" variant="ghost" onClick={() => setEditingIdentity(false)}>
                    {isEn ? "Cancel" : "Annuler"}
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>
        ) : null}

        {current && !showIdentityForm ? (
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{current.document.title}</h2>
                <p className="text-xs text-muted-foreground">{current.document.reference}</p>
                {current.document.notice ? <p className="mt-1 text-xs font-medium text-[var(--color-warning-text)]">{current.document.notice}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {pending && canSign ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingIdentity(true)}>
                    {isEn ? "Edit my details" : "Modifier mes informations"}
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => void download(current.id, Boolean(signed))}>
                  <Download className="mr-1 size-4" aria-hidden="true" />
                  {signed ? "PDF" : isEn ? "Draft PDF" : "PDF du projet"}
                </Button>
              </div>
            </div>
            <div
              ref={readerRef}
              onScroll={onReaderScroll}
              tabIndex={0}
              aria-label={isEn ? "Contract text" : "Texte du contrat"}
              className="max-h-[28rem] space-y-4 overflow-y-auto rounded-md border border-border bg-muted/20 p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {current.document.sections.map((section) => (
                <section key={section.title} className="space-y-1.5">
                  <h3 className="font-bold text-foreground">{section.title}</h3>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-foreground/90">{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>

            {pending && canSign ? (
              <div className="space-y-4 border-t border-border pt-4">
                {!readToEnd ? (
                  <p className="text-sm text-muted-foreground">{isEn ? "Scroll to the end of the contract to accept it." : "Faites défiler le contrat jusqu'à la fin pour pouvoir l'accepter."}</p>
                ) : null}
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4" disabled={!readToEnd} checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  <span>{isEn ? "I have read and accept this contract." : "J'ai lu et j'accepte ce contrat."}</span>
                </label>
                <Input
                  label={isEn ? "Type your full name" : "Saisissez votre nom complet"}
                  helpText={`${isEn ? "As in the contract:" : "Tel qu'au contrat :"} ${expectedName}`}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  autoComplete="name"
                />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">{isEn ? "Your handwritten signature (optional)" : "Votre signature manuscrite (facultatif)"}</p>
                  <SignaturePad isEn={isEn} disabled={signing} onChange={setSignature} />
                </div>
                <div className="space-y-2">
                  <Button type="button" variant="secondary" loading={sendingCode} onClick={() => void requestCode(pending)}>
                    {codeSent ? (isEn ? "Send a new code" : "Renvoyer un code") : isEn ? "Receive my signature code" : "Recevoir mon code de signature"}
                  </Button>
                  {devCode ? <p className="text-xs text-muted-foreground">{isEn ? "Test mode, code:" : "Mode test, code :"} {devCode}</p> : null}
                  {codeSent ? (
                    <Input
                      label={isEn ? "Code received by email (6 digits)" : "Code reçu par email (6 chiffres)"}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isEn
                    ? "Accepting, typing your name and confirming the email code is your electronic signature (Benin Digital Code). A signed copy is emailed to you."
                    : "Accepter, saisir votre nom et confirmer le code reçu par email vaut signature électronique (Code du numérique du Bénin). Une copie signée vous est envoyée par email."}
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto"
                  loading={signing}
                  disabled={!accepted || code.length !== 6 || signerName.trim().length < 3}
                  onClick={() => void submitSignature(pending)}
                >
                  {isEn ? "Sign and put online" : "Signer et mettre en ligne"}
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}

        {overview.history.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{isEn ? "Previous versions" : "Versions précédentes"}</h2>
            <ul className="space-y-2">
              {overview.history.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                  <span>
                    {formatDateTime(item.generatedAt, locale)} — {item.status === "SUPERSEDED" ? (isEn ? "replaced" : "remplacée") : item.status === "SIGNED" ? (isEn ? "signed" : "signée") : isEn ? "to sign" : "à signer"}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void download(item.id, item.status === "SIGNED")}>
                    <Download className="mr-1 size-4" aria-hidden="true" />
                    PDF
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </EventDashboardShell>
  );
}
