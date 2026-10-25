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
import { Button, Card, FormError, Input } from "@/components/ui";

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
  const { locale, t } = useI18n();
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
      setError(t("authpages.1"));
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
        showToast.success(t("authpages.2"));
        router.push("/dashboard/start");
        return;
      }
      setSuccess(true);
      showToast.success(t("authpages.3"));
      router.push(authLoginUrl());
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : t("authpages.4")
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function onResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t("authpages.5"));
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
          t("authpages.6")
        );
      } else {
        showToast.success(
          t("authpages.7")
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("authpages.8")
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
          {t("authpages.9")}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {emailFromQuery
            ? isEn
              ? `We sent a 6-digit code to ${emailFromQuery}. Enter it below to activate your account.`
              : `Nous avons envoyé un code à 6 chiffres à ${emailFromQuery}. Saisissez-le ci-dessous pour activer votre compte.`
            : t("authpages.10")}
        </p>

        {devOtp ? (
          <div className="mb-4 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4 text-sm text-[var(--color-warning-text)]">
            <p className="font-semibold">
              {t("authpages.11")}
            </p>
            <p className="mt-1 text-muted-foreground">
              {t("authpages.12")}
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-[0.35em] text-foreground">{devOtp}</p>
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-xl border border-[var(--color-success)]/30 bg-emerald-500/10 p-4 text-sm text-[var(--color-success-text)]">
            {t("authpages.13")}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onVerify}>
          {!emailFromQuery ? (
            <Input
              id="email"
              label={t("authpages.14")}
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
            label={t("authpages.15")}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            helpText={
              devOtp
                ? t("authpages.16")
                : t("authpages.17")
            }
            required
          />
          <FormError>{error}</FormError>
          <Button type="submit" loading={isVerifying} className="w-full" disabled={success}>
            {t("authpages.18")}
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
          {t("authpages.19")}
        </Button>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("authpages.20")}{" "}
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {t("authpages.21")}
          </Link>
        </p>
        <div className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="text-muted-foreground/60 transition-colors hover:text-foreground">
            {t("authpages.22")}
          </Link>
        </div>
      </Card>
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
