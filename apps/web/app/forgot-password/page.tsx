"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";
import { Button, FormError, Input } from "@/components/ui";

type ForgotPasswordResponse = {
  success: boolean;
  message?: string;
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await apiFetch<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() })
      });
      showToast.success(isEn ? "Check your inbox for a code." : "Consultez votre boîte mail pour le code.");
      const params = new URLSearchParams({ email: email.trim() });
      router.push(`/reset-password?${params.toString()}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEn
            ? "Request failed."
            : "La demande a échoué."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
          {isEn ? "Step 1 of 2" : "Étape 1 sur 2"}
        </p>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t("login.forgot")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isEn
            ? "Enter your email and we'll send a 6-digit reset code."
            : "Entrez votre e-mail et nous vous enverrons un code de réinitialisation à 6 chiffres."}
        </p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="email"
            label={t("login.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <FormError>{error}</FormError>
          <Button type="submit" loading={isLoading} className="w-full">
            {isEn ? "Send reset code" : "Envoyer le code"}
          </Button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {isEn ? "← Back to sign in" : "← Retour à la connexion"}
          </Link>
        </p>
      </GlassCard>
    </AuthSimpleLayout>
  );
}
