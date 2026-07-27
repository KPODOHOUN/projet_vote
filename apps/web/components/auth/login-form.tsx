"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch, ApiError } from "../../lib/api";
import { setStoredToken } from "../../lib/auth";
import { showToast } from "../../lib/toast";
import { trackEvent } from "../../lib/analytics";
import { useI18n } from "../../lib/i18n-provider";
import { authRegisterUrl } from "../../lib/auth-navigation";
import { Button, Input, FormError } from "@/components/ui";
import { OAuthButtons } from "./oauth-buttons";

type LoginResponse = {
  accessToken: string;
};

type FieldErrors = {
  email?: string | undefined;
  password?: string | undefined;
};

export type LoginFormProps = {
  /** Called after a successful sign-in instead of redirecting (modal use). */
  onSuccess?: () => void;
  /** Switch to the register form (modal use); falls back to a link otherwise. */
  onSwitchToRegister?: () => void;
  /** Hide the page-level heading (the dialog supplies its own title). */
  hideHeading?: boolean;
  /** Redirect after sign-in (e.g. from ?next= query). */
  returnTo?: string | null;
};

export function LoginForm({ onSuccess, onSwitchToRegister, hideHeading = false, returnTo = null }: LoginFormProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = t("login.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = t("login.invalidEmail");
    if (!password) next.password = t("login.required");
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLocked(false);
    setEmailNotVerified(false);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setStoredToken(result.accessToken);
      void trackEvent("login");
      showToast.success(isEn ? "Signed in successfully." : "Connexion réussie.");
      const me = await apiFetch<{ role: string }>("/auth/me", {
        headers: { Authorization: `Bearer ${result.accessToken}` }
      });
      const isAdmin = me.role === "PLATFORM_ADMIN" || me.role === "PLATFORM_SUPER_ADMIN";
      if (onSuccess) {
        onSuccess();
      }
      if (returnTo) {
        router.push(returnTo);
        return;
      }
      router.push(isAdmin ? "/admin" : "/dashboard");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        if (caughtError.code === "EMAIL_NOT_VERIFIED") {
          setEmailNotVerified(true);
          setError(
            isEn
              ? "Confirm your email first. Check your inbox or resend the link."
              : "Confirmez d'abord votre e-mail. Consultez votre boîte mail ou renvoyez le lien."
          );
        } else if (caughtError.code === "ACCOUNT_SUSPENDED") {
          setError(
            caughtError.message ||
              (isEn ? "This account is suspended. Contact support." : "Ce compte est suspendu. Contactez le support.")
          );
        } else if (caughtError.status === 429 || caughtError.status === 403) {
          setIsLocked(true);
        } else {
          setError(caughtError.message || t("login.fallbackError"));
        }
      } else {
        setError(caughtError instanceof Error ? caughtError.message : t("login.fallbackError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!hideHeading ? (
        <div className="mb-8 md:mb-10">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            {isEn ? "Sign in" : "Connexion"}
          </span>
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{t("login.title")}</h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            {isEn ? "Your email and password are enough." : "Votre e-mail et votre mot de passe suffisent."}
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Input
          ref={emailRef}
          id="email"
          label={t("login.email")}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() =>
            setFieldErrors((p) => ({
              ...p,
              email: !email.trim()
                ? t("login.required")
                : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                  ? undefined
                  : t("login.invalidEmail")
            }))
          }
          autoComplete="email"
          state={fieldErrors.email ? "error" : "default"}
          errorText={fieldErrors.email}
          required
        />

        <div className="relative group">
          <Input
            ref={passwordRef}
            id="password"
            label={t("login.password")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setFieldErrors((p) => ({ ...p, password: password ? undefined : t("login.required") }))}
            autoComplete="current-password"
            state={fieldErrors.password ? "error" : "default"}
            errorText={fieldErrors.password}
            required
          />
          <button
            type="button"
            className="absolute right-1 top-[20px] flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>

        <p className="text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            {t("login.forgot")}
          </Link>
          {emailNotVerified ? (
            <>
              {" · "}
              <Link href={`/check-email?email=${encodeURIComponent(email)}`} className="font-medium text-primary hover:underline">
                {isEn ? "Resend confirmation" : "Renvoyer la confirmation"}
              </Link>
            </>
          ) : null}
        </p>

        {isLocked ? (
          <div role="alert" aria-live="assertive" className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm mt-6">
            <strong className="block mb-1">{t("login.lockedTitle")}</strong>
            <span>{t("login.lockedHelp")}</span>
          </div>
        ) : (
          <FormError>{error}</FormError>
        )}

        <Button type="submit" loading={isLoading} size="lg" className="w-full h-12 text-md font-bold mt-4">
          {t("login.submit")}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons />
      </div>

      <div className="mt-6 pt-6 border-t border-border/50 text-center text-sm space-y-3">
        <p className="text-muted-foreground">
          {isEn ? "Don't have an account?" : "Vous n'avez pas encore de compte ?"}
          {onSwitchToRegister ? (
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-semibold text-primary hover:text-primary/80 hover:underline ml-1.5 transition-all"
            >
              {isEn ? "Sign up" : "S'inscrire"}
            </button>
          ) : (
            <Link href={authRegisterUrl()} className="font-semibold text-primary hover:text-primary/80 hover:underline ml-1.5 transition-all">
              {isEn ? "Sign up" : "S'inscrire"}
            </Link>
          )}
        </p>
      </div>
    </>
  );
}
