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
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { Button, Card, FormError, Input } from "@/components/ui";

function ResetPasswordContent() {
  const router = useRouter();
  const { locale, t } = useI18n();
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
        t("authpages.23")
      );
      return;
    }
    if (!email.trim()) {
      setError(t("authpages.24"));
      return;
    }
    const trimmedCode = code.replace(/\D/g, "").slice(0, 6);
    if (trimmedCode.length !== 6) {
      setError(t("authpages.25"));
      return;
    }
    const passwordError = validateStrongPassword(password, isEn);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("authpages.26"));
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
      showToast.success(t("authpages.27"));
      router.push(authLoginUrl());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t("authpages.28")
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        <p className="mb-2 text-sm font-semibold text-slate-600">
          {t("authpages.29")}
        </p>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
          {t("authpages.30")}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("authpages.31")}
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="email"
            label={t("authpages.32")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            id="otp"
            label={t("authpages.33")}
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
              label={t("authpages.34")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              helpText={
                t("authpages.35")
              }
            />
            <button
              type="button"
              className="absolute right-3 top-9 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? (t("authpages.36")) : t("authpages.37")}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Input
            id="passwordConfirm"
            label={t("authpages.38")}
            type={showPassword ? "text" : "password"}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
          <FormError>{error}</FormError>
          <Button type="submit" loading={isLoading} className="w-full">
            {t("authpages.39")}
          </Button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
            {t("authpages.40")}
          </Link>
          {" · "}
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline">
            {t("authpages.41")}
          </Link>
        </p>
      </Card>
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
