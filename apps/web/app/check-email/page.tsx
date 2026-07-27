"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";
import { Button, Input } from "@/components/ui";

type ResendResponse = {
  success: boolean;
  message?: string;
  verificationUrl?: string;
};

function CheckEmailContent() {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const initialVerifyUrl = searchParams.get("verify");
  const [verifyUrl, setVerifyUrl] = useState(initialVerifyUrl);
  const [resendEmail, setResendEmail] = useState(email);
  const [isLoading, setIsLoading] = useState(false);

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resendEmail.trim()) return;
    setIsLoading(true);
    try {
      const result = await apiFetch<ResendResponse>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: resendEmail.trim() })
      });
      if (result.verificationUrl) {
        setVerifyUrl(result.verificationUrl);
      }
      showToast.success(
        isEn ? "If your account is pending, we sent a new email." : "Si votre compte est en attente, un nouvel e-mail a été envoyé."
      );
    } catch {
      showToast.error(isEn ? "Could not resend the email." : "Impossible de renvoyer l'e-mail.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
          {isEn ? "Confirm your email" : "Confirmez votre e-mail"}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {email
            ? isEn
              ? `We sent a link to ${email}. Open it on this device, then sign in.`
              : `Nous avons envoyé un lien à ${email}. Ouvrez-le sur cet appareil, puis connectez-vous.`
            : isEn
              ? "Open the confirmation link we sent you, then sign in."
              : "Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous."}
        </p>

        {verifyUrl ? (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              {isEn
                ? "Email delivery is not configured yet. Use this link to confirm your account now:"
                : "L'envoi d'e-mails n'est pas encore configuré. Utilisez ce lien pour confirmer votre compte :"}
            </p>
            <Button asChild className="w-full">
              <a href={verifyUrl}>
                {isEn ? "Confirm my email now" : "Confirmer mon e-mail maintenant"}
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onResend}>
          <Input
            id="resendEmail"
            label={isEn ? "Your email" : "Votre e-mail"}
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            required
          />
          <Button type="submit" loading={isLoading} className="w-full" variant="secondary">
            {isEn ? "Resend confirmation email" : "Renvoyer l'e-mail de confirmation"}
          </Button>
        </form>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {isEn ? "Already confirmed?" : "Déjà confirmé ?"}{" "}
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {isEn ? "Sign in" : "Se connecter"}
          </Link>
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            {isEn ? "Organizer dashboard →" : "Tableau de bord organisateur →"}
          </Link>
          <Link href="/admin" className="hover:text-foreground transition-colors">
            {isEn ? "Platform administration →" : "Administration de la plateforme →"}
          </Link>
          <Link href="/" className="text-muted-foreground/60 hover:text-foreground transition-colors">
            {isEn ? "← Back to SHADOMA" : "← Retour sur SHADOMA"}
          </Link>
        </div>
      </GlassCard>
    </AuthSimpleLayout>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}
