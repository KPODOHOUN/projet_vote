"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import jsQR from "jsqr";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { authedFetch, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n-provider";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { parseTicketQr } from "@/lib/ticket-qr";

type ScanResult =
  | { kind: "ok"; holderName: string | null; ticketType: string; number: string | null }
  | { kind: "refused"; message: string }
  | { kind: "warning"; message: string };

type ValidateResponse = { ticket: { holderName: string | null; ticketType: string; number: string | null } };

/** Temps d'affichage d'une réponse avant de reprendre le scan. */
const RESULT_MS = 3_000;
/** Un même QR relu dans ce délai est ignoré (le téléphone reste pointé dessus). */
const SAME_CODE_MS = 6_000;

/** Bip court : aigu = entrée validée, grave = refus. */
function beep(ok: boolean) {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.15;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (ok ? 0.15 : 0.4));
    oscillator.onended = () => void context.close();
  } catch {
    // Son indisponible : la couleur et la vibration suffisent.
  }
}

/**
 * Scanner des entrées : la caméra du téléphone lit le QR code du billet, l'API
 * le valide (bon événement, payé, jamais passé) et la réponse s'affiche en grand.
 */
export default function TicketScanPage() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { locale } = useI18n();
  const isEn = locale === "en";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ text: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [admitted, setAdmitted] = useState(0);
  const [manual, setManual] = useState("");

  const validate = useCallback(
    async (raw: string) => {
      const parsed = parseTicketQr(raw);
      busy.current = true;
      if (!parsed) {
        setResult({ kind: "refused", message: isEn ? "This QR code is not a ticket from this platform." : "Ce QR code n'est pas un billet de la plateforme." });
        navigator.vibrate?.([100, 60, 100]);
        beep(false);
        return;
      }
      setChecking(true);
      try {
        const response = await authedFetch<ValidateResponse>("/tickets/validate", {
          method: "POST",
          body: JSON.stringify({ ...parsed, eventId })
        });
        setResult({ kind: "ok", ...response.ticket });
        setAdmitted((count) => count + 1);
        navigator.vibrate?.(200);
        beep(true);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : isEn ? "No connection: try again." : "Pas de connexion : réessayez.";
        // Pas encore payé : l'acheteur peut finir son paiement, ce n'est pas une fraude.
        const kind = /pas encore été payé/.test(message) ? "warning" : "refused";
        setResult({ kind, message });
        navigator.vibrate?.([100, 60, 100]);
        beep(false);
      } finally {
        setChecking(false);
      }
    },
    [eventId, isEn]
  );

  // Retour automatique au scan.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => { setResult(null); busy.current = false; }, RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastScan = 0;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || busy.current || video.readyState < 2 || time - lastScan < 200) return;
      lastScan = time;
      // Image réduite : lecture rapide même sur un petit téléphone.
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      if (!code?.data) return;
      const now = Date.now();
      if (lastCode.current && lastCode.current.text === code.data && now - lastCode.current.at < SAME_CODE_MS) return;
      lastCode.current = { text: code.data, at: now };
      void validate(code.data);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(isEn ? "This browser cannot use the camera. Type the ticket link below." : "Ce navigateur ne peut pas utiliser la caméra. Saisissez le lien du billet ci-dessous.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
        frame = requestAnimationFrame(tick);
      } catch {
        setCameraError(
          isEn
            ? "Camera access refused. Allow the camera for this site in your browser settings, then reload the page."
            : "Accès à la caméra refusé. Autorisez la caméra pour ce site dans les réglages du navigateur, puis rechargez la page."
        );
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isEn, validate]);

  const panel =
    result?.kind === "ok" ? "bg-emerald-600" : result?.kind === "warning" ? "bg-amber-500" : result ? "bg-red-600" : "";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      {/* Trois colonnes égales sur les bords : le titre reste au centre exact. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-11 w-11 justify-self-start p-0"
          onClick={() => router.push(`/dashboard/events/${eventId}/tickets`)}
          aria-label={isEn ? "Back to tickets" : "Retour aux billets"}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-center text-lg font-extrabold">{isEn ? "Scan entries" : "Scanner les entrées"}</h1>
        <span className="justify-self-end whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold tabular-nums text-emerald-900" aria-live="polite">
          {admitted} {isEn ? (admitted > 1 ? "entries" : "entry") : admitted > 1 ? "entrées" : "entrée"}
        </span>
      </div>

      {/* Hauteur bornée : le champ « QR abîmé » reste visible sans défiler. */}
      <div className="relative mx-auto aspect-[3/4] max-h-[60dvh] w-full overflow-hidden rounded-3xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label={isEn ? "Camera" : "Caméra"} />
        <canvas ref={canvasRef} className="hidden" />
        {cameraReady && !result ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-2/3 w-2/3 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        ) : null}
        {!cameraReady && !cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            <Camera className="h-10 w-10" aria-hidden="true" />
            <p className="text-sm">{isEn ? "Opening the camera…" : "Ouverture de la caméra…"}</p>
            <p className="px-8 text-center text-xs text-white/80">
              {isEn ? "If your phone asks, tap « Allow » to use the camera." : "Si le téléphone le demande, touchez « Autoriser » pour utiliser la caméra."}
            </p>
          </div>
        ) : null}
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-white">{cameraError}</div>
        ) : null}
        {checking ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
            <Loader2 className="h-12 w-12 animate-spin" aria-label={isEn ? "Checking" : "Vérification"} />
          </div>
        ) : null}
        {result ? (
          <button
            type="button"
            onClick={() => { setResult(null); busy.current = false; }}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white ${panel}`}
            role="status"
            aria-live="assertive"
          >
            {result.kind === "ok" ? (
              <>
                <CheckCircle2 className="h-24 w-24" aria-hidden="true" />
                <p className="text-3xl font-black">{isEn ? "Welcome!" : "Entrée validée"}</p>
                <p className="text-xl font-bold">{result.holderName ?? (isEn ? "No name" : "Sans nom")}</p>
                <p className="text-lg">{result.ticketType}{result.number ? ` · N° ${result.number}` : ""}</p>
              </>
            ) : (
              <>
                {result.kind === "warning" ? <AlertTriangle className="h-24 w-24" aria-hidden="true" /> : <XCircle className="h-24 w-24" aria-hidden="true" />}
                <p className="text-3xl font-black">{result.kind === "warning" ? (isEn ? "Not paid yet" : "Pas encore payé") : isEn ? "Refused" : "Refusé"}</p>
                <p className="text-lg font-semibold">{result.message}</p>
              </>
            )}
            <span className="mt-4 rounded-full bg-white/20 px-4 py-2 text-sm font-bold">{isEn ? "Tap to scan the next one" : "Touchez pour scanner le suivant"}</span>
          </button>
        ) : null}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (manual.trim()) { void validate(manual); setManual(""); }
        }}
      >
        <Input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder={isEn ? "Damaged QR? Paste the link" : "QR abîmé ? Collez le lien"}
          aria-label={isEn ? "Ticket link" : "Lien du billet"}
          className="h-11"
        />
        <Button type="submit" className="h-11" disabled={checking || !manual.trim()}>{isEn ? "Check" : "Vérifier"}</Button>
      </form>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {isEn
          ? "Green: let in. Red: refuse (already used, wrong event or fake). Orange: the buyer must finish paying."
          : "Vert : faire entrer. Rouge : refuser (déjà utilisé, autre événement ou faux). Orange : l'acheteur doit finir de payer."}
      </p>
    </div>
  );
}
