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
import { rememberOrgCode } from "../../lib/organizer-storage";
import { slugifyTitle } from "../../lib/slugify";
import { useI18n } from "../../lib/i18n-provider";
import { validateStrongPassword } from "../../lib/password-policy";
import { sanitizePhoneInput } from "../../lib/phone";
import { authLoginUrl } from "../../lib/auth-navigation";
import { Button, Input, FormError, Checkbox } from "@/components/ui";
import { OAuthButtons } from "./oauth-buttons";

type OfferType = "EXTERNAL" | "ESCROW";

type RegisterResponse =
  | { accessToken: string }
  | {
      requiresEmailVerification: true;
      email: string;
      otpCode?: string;
      verificationUrl?: string;
    };

type FieldErrors = {
  tenantDisplayName?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
  passwordConfirm?: string | undefined;
  offerType?: string | undefined;
};

const SLUG_PATTERN = /^[a-z0-9-]+$/;

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

  const [tenantDisplayName, setTenantDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // Escrow seul (D10) ; la valeur part toujours dans le payload d'inscription.
  const offerType: OfferType = "ESCROW";
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const required = t("auth.register.required");

  const deriveOrgCode = (name: string): string => slugifyTitle(name).trim().toLowerCase();

  const validate = () => {
    const next: FieldErrors = {};
    const orgCode = deriveOrgCode(tenantDisplayName);
    if (!tenantDisplayName.trim()) next.tenantDisplayName = required;
    else if (orgCode.length < 3 || !SLUG_PATTERN.test(orgCode)) next.tenantDisplayName = t("auth.register.orgNameInvalid");
    if (!firstName.trim()) next.firstName = required;
    if (!lastName.trim()) next.lastName = required;
    if (!email.trim()) next.email = required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = t("auth.register.emailInvalid");
    const passwordError = validateStrongPassword(password, isEn);
    if (passwordError) next.password = passwordError;
    if (!passwordConfirm) next.passwordConfirm = required;
    else if (passwordConfirm !== password) next.passwordConfirm = t("auth.register.passwordMismatch");
    if (offerType !== "ESCROW") next.offerType = t("auth.register.offerOnlyEscrow");
    return next;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.tenantDisplayName) displayNameRef.current?.focus();
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
      const tenantSlug = deriveOrgCode(tenantDisplayName);
      const result = await apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          tenantSlug,
          tenantDisplayName: tenantDisplayName.trim(),
          email: email.trim(),
          password,
          passwordConfirm,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          offerType,
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
        rememberOrgCode(tenantSlug);
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
        setError(t("auth.register.orgTaken"));
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
          <span className="mb-6 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            {t("auth.register.badge")}
          </span>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("auth.register.title")}
          </h1>
          <p className="mb-8 text-muted-foreground">{t("auth.register.subtitle")}</p>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="space-y-4">
          <Input
            ref={displayNameRef}
            id="tenantDisplayName"
            label={t("auth.register.orgName")}
            helpText={t("auth.register.orgNameHelp")}
            value={tenantDisplayName}
            onChange={(event) => setTenantDisplayName(event.target.value)}
            onBlur={() =>
              setFieldErrors((p) => ({ ...p, tenantDisplayName: tenantDisplayName.trim() ? undefined : required }))
            }
            placeholder={isEn ? "Demo Vote" : "Vote Demo"}
            autoComplete="organization"
            state={fieldErrors.tenantDisplayName ? "error" : "default"}
            errorText={fieldErrors.tenantDisplayName}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
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
                  : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                    ? undefined
                    : t("auth.register.emailInvalid")
              }))
            }
            autoComplete="email"
            state={fieldErrors.email ? "error" : "default"}
            errorText={fieldErrors.email}
            required
          />
          {/* Téléphone optionnel replié : réduit la hauteur du formulaire
              initial dans la modale (friction) sans retirer le champ. */}
          {showPhone ? (
            <div className="space-y-1.5">
              <Input
                id="phone"
                label={t("auth.register.phone")}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                autoComplete="tel"
                helpText={t("auth.register.phoneHelp")}
              />
              <button
                type="button"
                onClick={() => {
                  setShowPhone(false);
                  setPhone("");
                }}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("auth.register.removePhone")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPhone(true)}
              className="text-sm font-medium text-primary transition-colors hover:underline"
            >
              {t("auth.register.addPhone")}
            </button>
          )}
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
              className="absolute right-3 top-9 text-muted-foreground transition-colors hover:text-foreground"
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

          {/* Offre Escrow seule (D10) : affichée, pas choisie. */}
          <div className="rounded-md border border-border bg-muted/40 p-3.5">
            <p className="text-sm font-semibold text-slate-900">{t("auth.register.offerEscrowTitle")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{t("auth.register.offerEscrowDesc")}</p>
          </div>
        </div>

        <div className="flex flex-row items-start gap-3">
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

        <FormError>{error}</FormError>

        <Button
          type="submit"
          loading={isLoading}
          disabled={!acceptPrivacy}
          className="h-12 w-full text-md font-bold shadow-lg"
        >
          {t("auth.register.submit")}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons />
      </div>

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
