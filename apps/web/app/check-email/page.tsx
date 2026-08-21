"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "../../lib/api";
import { setStoredToken } from "../../lib/auth";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";
import { Button, FormError, Input } from "@/components/ui";

const DEV_OTP_STORAGE_KEY = "vp.dev.emailOtp";

type VerifyOtpResponse = {
  success?: boolean;
  accessToken?: string;
  message?: string;
};

type ResendOtpResponse = {
  success: boolean;
  message?: string;
  otpCode?: string;
};

function readDevOtp(email: string): string | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const raw = sessionStorage.getItem(DEV_OTP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; code?: string };
    if (
      typeof parsed.email === "string" &&
      parsed.email.toLowerCase() === email.toLowerCase() &&
      typeof parsed.code === "string" &&
      /^\d{6}$/.test(parsed.code)
    ) {
      return parsed.code;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeDevOtp(email: string, code: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DEV_OTP_STORAGE_KEY, JSON.stringify({ email, code }));
  } catch {
    // ignore
  }
}

function clearDevOtp() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DEV_OTP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function CheckEmailContent() {
  const router = useRouter();
  const { locale } = useI18n();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    setEmail(emailFromQuery);
    const stored = readDevOtp(emailFromQuery);
    if (stored) {
      setDevOtp(stored);
      setCode(stored);
    }
  }, [emailFromQuery]);

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);
    const trimmedEmail = email.trim();
    const trimmedCode = code.replace(/\D/g, "").slice(0, 6);
    if (!trimmedEmail || trimmedCode.length !== 6) {
      setError(isEn ? "Enter your email and the 6-digit code." : "Saisissez votre e-mail et le code à 6 chiffres.");
      return;
    }
    setIsVerifying(true);
    try {
      const result = await apiFetch<VerifyOtpResponse>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          email: trimmedEmail,
          code: trimmedCode,
          purpose: "EMAIL_VERIFICATION"
        })
      });
      clearDevOtp();
      if (result.accessToken) {
        setStoredToken(result.accessToken);
        setSuccess(true);
        showToast.success(isEn ? "Email confirmed. Welcome!" : "E-mail confirmé. Bienvenue !");
        router.push("/dashboard/start");
        return;
      }
      setSuccess(true);
      showToast.success(isEn ? "Email confirmed. You can sign in." : "E-mail confirmé. Vous pouvez vous connecter.");
      router.push(authLoginUrl());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : isEn
              ? "Verification failed."
              : "La vérification a échoué."
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function onResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(isEn ? "Enter your email to resend the code." : "Saisissez votre e-mail pour renvoyer le code.");
      return;
    }
    setError("");
    setIsResending(true);
    try {
      const result = await apiFetch<ResendOtpResponse>("/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({
          email: trimmedEmail,
          purpose: "EMAIL_VERIFICATION"
        })
      });
      if (result.otpCode) {
        writeDevOtp(trimmedEmail, result.otpCode);
        setDevOtp(result.otpCode);
        setCode(result.otpCode);
        showToast.success(
          isEn ? "New verification code ready (local/dev)." : "Nouveau code prêt (mode local/dev)."
        );
      } else {
        showToast.success(
          isEn
            ? "If your account is pending, we sent a new code."
            : "Si votre compte est en attente, un nouveau code a été envoyé."
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isEn
            ? "Could not resend the code."
            : "Impossible de renvoyer le code."
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
          {isEn ? "Confirm your email" : "Confirmez votre e-mail"}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {emailFromQuery
            ? isEn
              ? `We sent a 6-digit code to ${emailFromQuery}. Enter it below to activate your account.`
              : `Nous avons envoyé un code à 6 chiffres à ${emailFromQuery}. Saisissez-le ci-dessous pour activer votre compte.`
            : isEn
              ? "Enter the 6-digit code we sent by email."
              : "Saisissez le code à 6 chiffres reçu par e-mail."}
        </p>

        {devOtp ? (
          <div className="mb-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4 text-sm text-[var(--color-warning-text)]">
            <p className="font-semibold">
              {isEn ? "Local / development mode" : "Mode local / développement"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {isEn
                ? "No email provider configured — use this code:"
                : "Aucun envoi e-mail configuré — utilisez ce code :"}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-[0.35em] text-foreground">{devOtp}</p>
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-xl border border-[var(--color-success)]/30 bg-emerald-500/10 p-4 text-sm text-[var(--color-success-text)]">
            {isEn ? "Email confirmed. Redirecting…" : "E-mail confirmé. Redirection…"}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onVerify}>
          {!emailFromQuery ? (
            <Input
              id="email"
              label={isEn ? "Your email" : "Votre e-mail"}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          ) : (
            <input type="hidden" value={email} readOnly />
          )}
          <Input
            id="otp"
            label={isEn ? "Verification code" : "Code de vérification"}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            helpText={
              devOtp
                ? isEn
                  ? "Pre-filled from local/dev response."
                  : "Prérempli depuis la réponse locale/dev."
                : isEn
                  ? "6 digits from your email."
                  : "6 chiffres reçus par e-mail."
            }
            required
          />
          <FormError>{error}</FormError>
          <Button type="submit" loading={isVerifying} className="w-full" disabled={success}>
            {isEn ? "Confirm email" : "Confirmer l'e-mail"}
          </Button>
        </form>

        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          loading={isResending}
          onClick={() => void onResend()}
          disabled={success}
        >
          {isEn ? "Resend code" : "Renvoyer le code"}
        </Button>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {isEn ? "Already confirmed?" : "Déjà confirmé ?"}{" "}
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {isEn ? "Sign in" : "Se connecter"}
          </Link>
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="text-muted-foreground/60 transition-colors hover:text-foreground">
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
