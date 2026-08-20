"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { validateStrongPassword } from "../../lib/password-policy";
import { authLoginUrl } from "@/lib/auth-navigation";
import { GlassCard } from "@/components/glass-card";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { Button, FormError, Input } from "@/components/ui";

function ResetPasswordContent() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";
  const legacyToken = searchParams.get("token");

  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEmail(emailFromQuery);
  }, [emailFromQuery]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (legacyToken && !emailFromQuery) {
      setError(
        isEn
          ? "Link-based reset is no longer supported. Request a new code from the forgot-password page."
          : "La réinitialisation par lien n'est plus disponible. Demandez un nouveau code depuis la page mot de passe oublié."
      );
      return;
    }
    if (!email.trim()) {
      setError(isEn ? "Email is required." : "L'e-mail est requis.");
      return;
    }
    const trimmedCode = code.replace(/\D/g, "").slice(0, 6);
    if (trimmedCode.length !== 6) {
      setError(isEn ? "Enter the 6-digit code." : "Saisissez le code à 6 chiffres.");
      return;
    }
    const passwordError = validateStrongPassword(password, isEn);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== passwordConfirm) {
      setError(isEn ? "Passwords do not match." : "Les mots de passe ne correspondent pas.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          code: trimmedCode,
          password,
          passwordConfirm
        })
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
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
          {isEn ? "Step 2 of 2" : "Étape 2 sur 2"}
        </p>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
          {isEn ? "Reset password" : "Réinitialiser le mot de passe"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isEn
            ? "Enter the code from your email and choose a new password."
            : "Saisissez le code reçu par e-mail et choisissez un nouveau mot de passe."}
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="email"
            label={isEn ? "Email" : "E-mail"}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            id="otp"
            label={isEn ? "Reset code" : "Code de réinitialisation"}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
          <div className="relative">
            <Input
              id="password"
              label={isEn ? "New password" : "Nouveau mot de passe"}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              helpText={
                isEn
                  ? "At least 10 characters, mixing two kinds (letters, digits, symbols)."
                  : "Au moins 10 caractères, en combinant deux types (lettres, chiffres, symboles)."
              }
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
          <Input
            id="passwordConfirm"
            label={isEn ? "Confirm password" : "Confirmer le mot de passe"}
            type={showPassword ? "text" : "password"}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
          <FormError>{error}</FormError>
          <Button type="submit" loading={isLoading} className="w-full">
            {isEn ? "Save new password" : "Enregistrer le nouveau mot de passe"}
          </Button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
            {isEn ? "Request a new code" : "Demander un nouveau code"}
          </Link>
          {" · "}
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
