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
import { validateStrongPassword } from "../../lib/password-policy";
import { sanitizePhoneInput } from "../../lib/phone";
import { authLoginUrl } from "../../lib/auth-navigation";
import { Button, Input, FormError, Checkbox } from "@/components/ui";
import { OAuthButtons } from "./oauth-buttons";

type RegisterResponse =
  | { accessToken: string }
  | {
      requiresEmailVerification: true;
      email: string;
      otpCode?: string;
      verificationUrl?: string;
    };

type FieldErrors = {
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
  passwordConfirm?: string | undefined;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterFormProps = {
  /** Called after a successful account creation instead of redirecting (modal use). */
  onSuccess?: () => void;
  /** Switch to the login form (modal use); falls back to a link otherwise. */
  onSwitchToLogin?: () => void;
  /** Hide the page-level heading (the dialog supplies its own title). */
  hideHeading?: boolean;
};

export function RegisterForm({ onSuccess, onSwitchToLogin, hideHeading = false }: RegisterFormProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const isEn = locale === "en";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  // Deux étapes : 1. qui vous êtes, 2. votre mot de passe. Un seul envoi à la fin.
  const [step, setStep] = useState<1 | 2>(1);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const required = t("auth.register.required");

  // Inscription : seulement ce qui sert au compte. Les informations du contrat
  // sont demandées au moment de signer le premier concours.
  const validateIdentity = () => {
    const next: FieldErrors = {};
    if (!firstName.trim()) next.firstName = required;
    if (!lastName.trim()) next.lastName = required;
    if (phone.replace(/\D/g, "").length < 8) next.phone = phone.trim() ? t("auth.register.phoneInvalid") : required;
    if (!email.trim()) next.email = required;
    else if (!EMAIL_PATTERN.test(email)) next.email = t("auth.register.emailInvalid");
    return next;
  };

  const goToSecurity = () => {
    const errors = validateIdentity();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.email && !errors.firstName) emailRef.current?.focus();
      else firstNameRef.current?.focus();
      return;
    }
    setError("");
    setStep(2);
    window.setTimeout(() => passwordRef.current?.focus(), 50);
  };

  const validate = () => {
    const next: FieldErrors = validateIdentity();
    const passwordError = validateStrongPassword(password, isEn);
    if (passwordError) next.password = passwordError;
    if (!passwordConfirm) next.passwordConfirm = required;
    else if (passwordConfirm !== password) next.passwordConfirm = t("auth.register.passwordMismatch");
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (step === 1) {
      goToSecurity();
      return;
    }
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.firstName || errors.lastName || errors.phone || errors.email) setStep(1);
      if (errors.firstName) firstNameRef.current?.focus();
      else if (errors.email) emailRef.current?.focus();
      else if (errors.password || errors.passwordConfirm) passwordRef.current?.focus();
      return;
    }
    if (!acceptPrivacy) {
      setError(t("auth.register.privacyRequired"));
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const result = await apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password,
          passwordConfirm,
          acceptPrivacyPolicy: true
        })
      });
      if ("requiresEmailVerification" in result && result.requiresEmailVerification) {
        showToast.success(result.otpCode ? t("auth.register.otpToastCode") : t("auth.register.otpToast"));
        void trackEvent("register");
        if (onSuccess) {
          onSuccess();
        }
        if (result.otpCode && typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              "vp.dev.emailOtp",
              JSON.stringify({ email: result.email, code: result.otpCode })
            );
          } catch {
            // ignore (private mode / blocked storage)
          }
        }
        const params = new URLSearchParams({ email: result.email });
        await new Promise((r) => setTimeout(r, 800));
        router.push(`/check-email?${params.toString()}`);
        return;
      }
      if ("accessToken" in result) {
        setStoredToken(result.accessToken);
        showToast.success(t("auth.register.successToast"));
        void trackEvent("register");
        if (onSuccess) {
          onSuccess();
        }
        await new Promise((r) => setTimeout(r, 800));
        router.push("/dashboard/start");
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409) {
        // Un compte existe déjà avec cet email : l'email est à l'étape 1.
        setStep(1);
        setFieldErrors((p) => ({ ...p, email: t("auth.register.emailTaken") }));
      } else {
        setError(caughtError instanceof Error ? caughtError.message : t("auth.register.failed"));
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <>
      {!hideHeading ? (
        <>
          <span className="mb-6 inline-block text-xs font-semibold text-slate-600">
            {t("auth.register.badge")}
          </span>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("auth.register.title")}
          </h1>
          <p className="mb-8 text-muted-foreground">{t("auth.register.subtitle")}</p>
        </>
      ) : null}
      <div className="mb-6" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            {step === 1 ? t("auth.register.stepIdentity") : t("auth.register.stepSecurity")}
          </p>
          <p className="text-xs font-medium text-muted-foreground">{t("auth.register.stepOf", { step, total: 2 })}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5" aria-hidden="true">
          <span className="h-1 rounded-full bg-primary" />
          <span className={`h-1 rounded-full transition-colors ${step === 2 ? "bg-primary" : "bg-muted"}`} />
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <div className="grid grid-cols-2 gap-3">
            <Input
              ref={firstNameRef}
              id="firstName"
              label={t("auth.register.firstName")}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              state={fieldErrors.firstName ? "error" : "default"}
              errorText={fieldErrors.firstName}
              required
            />
            <Input
              id="lastName"
              label={t("auth.register.lastName")}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              state={fieldErrors.lastName ? "error" : "default"}
              errorText={fieldErrors.lastName}
              required
            />
          </div>
          <Input
            ref={emailRef}
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() =>
              setFieldErrors((p) => ({
                ...p,
                email: !email.trim()
                  ? required
                  : EMAIL_PATTERN.test(email)
                    ? undefined
                    : t("auth.register.emailInvalid")
              }))
            }
            autoComplete="email"
            state={fieldErrors.email ? "error" : "default"}
            errorText={fieldErrors.email}
            required
          />
          <Input
            id="phone"
            label={t("auth.register.phone")}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            autoComplete="tel"
            helpText={t("auth.register.phoneHelp")}
            state={fieldErrors.phone ? "error" : "default"}
            errorText={fieldErrors.phone}
            required
          />
        </div>

        <div className={step === 2 ? "space-y-4" : "hidden"}>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="password"
              label={t("auth.register.password")}
              helpText={t("auth.register.passwordHelp")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() =>
                setFieldErrors((p) => ({
                  ...p,
                  password: validateStrongPassword(password, isEn)
                }))
              }
              autoComplete="new-password"
              state={fieldErrors.password ? "error" : "default"}
              errorText={fieldErrors.password}
              required
            />
            <button
              type="button"
              className="absolute right-1 top-[30px] flex size-9 items-center justify-center rounded-md text-muted-foreground sm:top-[28px] transition-colors hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <Input
            id="passwordConfirm"
            label={t("auth.register.passwordConfirm")}
            type={showPassword ? "text" : "password"}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            state={fieldErrors.passwordConfirm ? "error" : "default"}
            errorText={fieldErrors.passwordConfirm}
            required
          />

          <div className="flex flex-row items-start gap-3 pt-1">
          <Checkbox
            id="acceptPrivacy"
            checked={acceptPrivacy}
            onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
            className="mt-1"
          />
          <label htmlFor="acceptPrivacy" className="cursor-pointer text-sm leading-relaxed text-muted-foreground">
            {t("auth.register.privacyPrefix")}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              {t("auth.register.privacyLink")}
            </Link>
            {t("auth.register.privacySuffix")}
          </label>
          </div>
        </div>

        <FormError>{error}</FormError>

        {step === 1 ? (
          <Button type="submit" size="lg" className="w-full font-semibold">
            {t("auth.register.continue")}
          </Button>
        ) : (
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" size="lg" className="sm:w-auto" onClick={() => setStep(1)}>
              {t("auth.register.back")}
            </Button>
            <Button type="submit" size="lg" loading={isLoading} disabled={!acceptPrivacy} className="flex-1 font-semibold">
              {t("auth.register.submit")}
            </Button>
          </div>
        )}
      </form>

      {step === 1 ? (
        <div className="mt-6">
          <OAuthButtons />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-border pt-6 text-sm">
        <span className="text-muted-foreground">{t("auth.register.hasAccount")}</span>
        {onSwitchToLogin ? (
          <button type="button" onClick={onSwitchToLogin} className="font-semibold text-primary transition-all hover:underline hover:underline-offset-2">
            {t("auth.register.signIn")}
          </button>
        ) : (
          <Link href={authLoginUrl()} className="font-semibold text-primary transition-all hover:underline hover:underline-offset-2">
            {t("auth.register.signIn")}
          </Link>
        )}
      </div>
    </>
  );
}
