"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { acceptInvitation } from "../../../lib/invitations";
import { ApiError } from "../../../lib/api";
import { setStoredToken, getStoredToken } from "../../../lib/auth";
import { useI18n } from "../../../lib/i18n-provider";
import { authLoginUrl } from "../../../lib/auth-navigation";
import { Button, Input, FormError } from "@/components/ui";

type FieldErrors = { password?: string | undefined; confirm?: string | undefined };

export function AcceptInvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAlreadyLoggedIn, setIsAlreadyLoggedIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && getStoredToken()) {
      setIsAlreadyLoggedIn(true);
    }
  }, []);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (password.length < 8) next.password = t("accept.passwordTooShort");
    if (confirm !== password) next.confirm = t("accept.passwordMismatch");
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const errors = validate();
    if (errors.password || errors.confirm) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const result = await acceptInvitation({ token, password });
      setStoredToken(result.accessToken);
      router.push("/dashboard");
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409) {
        setError(t("accept.alreadyMember"));
      } else if (caughtError instanceof ApiError && caughtError.status === 429) {
        setError(t("accept.throttled"));
      } else if (caughtError instanceof ApiError && caughtError.status === 401) {
        setError(t("accept.invalid"));
      } else {
        setError(caughtError instanceof Error ? caughtError.message : t("accept.fallbackError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center text-center space-y-4 mb-8">
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-widest uppercase bg-primary/10 text-primary">{t("accept.title")}</span>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("accept.title")}</h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{t("accept.lead")}</p>
      </div>
      {isAlreadyLoggedIn && (
        <div className="p-4 mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-sm font-medium leading-relaxed" role="alert">
          {t("accept.alreadyLoggedInWarning")}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="relative">
          <Input
            id="password"
            label={t("accept.passwordLabel")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            state={fieldErrors.password ? "error" : "default"}
            errorText={fieldErrors.password}
            required
          />
          <button
            type="button"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent flex items-end pb-2.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <Input
          id="confirm"
          label={t("accept.confirmLabel")}
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          state={fieldErrors.confirm ? "error" : "default"}
          errorText={fieldErrors.confirm}
          required
        />
        <FormError>{error}</FormError>
        <Button type="submit" loading={isLoading} className="w-full">
          {isLoading ? t("accept.submitting") : t("accept.submit")}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm">
        <Link href={authLoginUrl()} className="font-semibold text-primary hover:text-primary/80 hover:underline hover:underline-offset-2 transition-all">
          {t("accept.backToLogin")}
        </Link>
      </div>
    </>
  );
}
