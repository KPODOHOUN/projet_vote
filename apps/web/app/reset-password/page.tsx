"use client";
import { authLoginUrl } from "@/lib/auth-navigation";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { validateStrongPassword } from "../../lib/password-policy";
import { GlassCard } from "@/components/glass-card";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { Button, Input, FormError } from "@/components/ui";

function ResetPasswordContent() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError(isEn ? "Missing reset token." : "Jeton de réinitialisation manquant.");
      return;
    }
    const passwordError = validateStrongPassword(password, isEn);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      showToast.success(isEn ? "Password updated." : "Mot de passe mis à jour.");
      router.push(authLoginUrl());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : isEn
            ? "Reset failed."
            : "La réinitialisation a échoué."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
          {isEn ? "Reset password" : "Réinitialiser le mot de passe"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isEn
            ? "At least 10 characters, mixing two kinds (letters, digits, symbols)."
            : "Au moins 10 caractères, en combinant deux types (lettres, chiffres, symboles)."}
        </p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="relative">
            <Input
              id="password"
              label={isEn ? "New password" : "Nouveau mot de passe"}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-9 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? (isEn ? "Hide" : "Masquer") : isEn ? "Show" : "Afficher"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" loading={isLoading} className="w-full">
            {isEn ? "Save new password" : "Enregistrer le nouveau mot de passe"}
          </Button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {isEn ? "Back to sign in" : "Retour à la connexion"}
          </Link>
        </p>
      </GlassCard>
    </AuthSimpleLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
