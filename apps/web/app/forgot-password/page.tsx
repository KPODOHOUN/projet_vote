"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";
import { Button, Input } from "@/components/ui";

type ForgotPasswordResponse = {
  success: boolean;
  message?: string;
  resetUrl?: string;
};

export default function ForgotPasswordPage() {
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await apiFetch<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() })
      });
      if (result.resetUrl) {
        setResetUrl(result.resetUrl);
      }
      setSent(true);
      showToast.success(isEn ? "Check your inbox." : "Consultez votre boîte mail.");
    } catch {
      showToast.error(isEn ? "Request failed." : "La demande a échoué.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t("login.forgot")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isEn
            ? "Enter your email and we'll send you a secure reset link."
            : "Entrez votre e-mail et nous vous enverrons un lien sécurisé de réinitialisation."}
        </p>
        {sent ? (
          <>
            {resetUrl ? (
              <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  {isEn
                    ? "Email delivery is not configured yet. Use this link to reset your password now:"
                    : "L'envoi d'e-mails n'est pas encore configuré. Utilisez ce lien pour réinitialiser votre mot de passe :"}
                </p>
                <Button asChild className="w-full">
                  <a href={resetUrl}>
                    {isEn ? "Reset my password" : "Réinitialiser mon mot de passe"}
                    <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {isEn
                  ? "If an account exists for this email, you will receive a reset link shortly."
                  : "Si un compte existe pour cet e-mail, vous recevrez un lien de réinitialisation sous peu."}
              </p>
            )}
          </>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              id="email"
              label={t("login.email")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" loading={isLoading} className="w-full">
              {isEn ? "Send reset link" : "Envoyer le lien"}
            </Button>
          </form>
        )}
        <p className="mt-8 text-center text-sm">
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {isEn ? "← Back to sign in" : "← Retour à la connexion"}
          </Link>
        </p>
      </GlassCard>
    </AuthSimpleLayout>
  );
}
