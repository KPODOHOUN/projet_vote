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
import { authLoginUrl } from "../../lib/auth-navigation";
import { Button, Input, FormError, Checkbox } from "@/components/ui";
import { OAuthButtons } from "./oauth-buttons";

type RegisterResponse =
  | { accessToken: string }
  | { requiresEmailVerification: true; email: string; verificationUrl?: string };

type FieldErrors = {
  tenantDisplayName?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
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
  const { locale } = useI18n();
  const isEn = locale === "en";

  const [tenantDisplayName, setTenantDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const displayNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const required = isEn ? "Required field." : "Champ requis.";

  const deriveOrgCode = (name: string): string => slugifyTitle(name).trim().toLowerCase();

  const validate = () => {
    const next: FieldErrors = {};
    const orgCode = deriveOrgCode(tenantDisplayName);
    if (!tenantDisplayName.trim()) next.tenantDisplayName = required;
    else if (orgCode.length < 3 || !SLUG_PATTERN.test(orgCode))
      next.tenantDisplayName = isEn
        ? "Use at least 3 letters or numbers in your organization name."
        : "Utilisez au moins 3 lettres ou chiffres dans le nom de l'organisation.";
    if (!email.trim()) next.email = required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = isEn ? "Invalid email." : "Email invalide.";
    const passwordError = validateStrongPassword(password, isEn);
    if (passwordError) next.password = passwordError;
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
      else if (errors.password) passwordRef.current?.focus();
      return;
    }
    if (!acceptPrivacy) {
      setError(
        isEn
          ? "You must accept the privacy policy to create an account."
          : "Vous devez accepter la politique de confidentialité pour créer un compte."
      );
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
          acceptPrivacyPolicy: true
        })
      });
      if ("requiresEmailVerification" in result && result.requiresEmailVerification) {
        showToast.success(
          isEn ? "Verification email sent — check your inbox." : "Un email de vérification vous a été envoyé."
        );
        void trackEvent("register");
        if (onSuccess) {
          onSuccess();
        }
        const params = new URLSearchParams({ email: result.email });
        if (result.verificationUrl) {
          params.set("verify", result.verificationUrl);
        }
        await new Promise((r) => setTimeout(r, 800));
        router.push(`/check-email?${params.toString()}`);
        return;
      }
      if ("accessToken" in result) {
        setStoredToken(result.accessToken);
        rememberOrgCode(tenantSlug);
        showToast.success(isEn ? "Account created." : "Compte créé.");
        void trackEvent("register");
        if (onSuccess) {
          onSuccess();
        }
        await new Promise((r) => setTimeout(r, 800));
        router.push("/dashboard/start");
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409) {
        setError(isEn ? "This organization name is already taken." : "Ce nom d'organisation est déjà utilisé.");
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : isEn
              ? "Account creation failed."
              : "La création du compte a échoué."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!hideHeading ? (
        <>
          <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-6">
            {isEn ? "Sign up" : "Inscription"}
          </span>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {isEn ? "Create your organizer account" : "Créez votre compte organisateur"}
          </h1>
          <p className="text-muted-foreground mb-8">
            {isEn
              ? "Three fields, then confirm your email to activate your account."
              : "Trois champs, puis confirmez votre e-mail pour activer votre compte."}
          </p>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="space-y-4">
          <Input
            ref={displayNameRef}
            id="tenantDisplayName"
            label={isEn ? "Organization name" : "Nom de l'organisation"}
            helpText={
              isEn
                ? "Your public name. We'll generate your sign-in code from it."
                : "Le nom affiché. Nous en déduisons automatiquement votre code de connexion."
            }
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
                    : isEn
                      ? "Invalid email."
                      : "Email invalide."
              }))
            }
            autoComplete="email"
            state={fieldErrors.email ? "error" : "default"}
            errorText={fieldErrors.email}
            required
          />
          <div className="relative">
            <Input
              ref={passwordRef}
              id="password"
              label={isEn ? "Password" : "Mot de passe"}
              helpText={
                isEn
                  ? "At least 10 characters, mixing two kinds (letters, digits, symbols)."
                  : "Au moins 10 caractères, en combinant deux types (lettres, chiffres, symboles)."
              }
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
              className="absolute right-3 top-9 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? (isEn ? "Hide password" : "Masquer le mot de passe") : isEn ? "Show password" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="flex flex-row items-start gap-3">
          <Checkbox
            id="acceptPrivacy"
            checked={acceptPrivacy}
            onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
            className="mt-1"
          />
          <label htmlFor="acceptPrivacy" className="text-sm leading-relaxed text-muted-foreground cursor-pointer">
            {isEn ? "I accept the " : "J'accepte la "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">
              {isEn ? "privacy policy" : "politique de confidentialité"}
            </Link>
            {isEn ? " on behalf of my organization." : " au nom de mon organisation."}
          </label>
        </div>

        <FormError>{error}</FormError>

        <Button
          type="submit"
          loading={isLoading}
          disabled={!acceptPrivacy}
          className="w-full h-12 text-md font-bold shadow-lg"
        >
          {isEn ? "Create my account" : "Créer mon compte"}
        </Button>
      </form>

      <div className="mt-6">
        <OAuthButtons />
      </div>

      <div className="mt-6 pt-6 border-t border-border flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{isEn ? "Already have an account?" : "Vous avez déjà un compte ?"}</span>
        {onSwitchToLogin ? (
          <button type="button" onClick={onSwitchToLogin} className="font-semibold text-primary hover:underline hover:underline-offset-2 transition-all">
            {isEn ? "Sign in" : "Se connecter"}
          </button>
        ) : (
          <Link href={authLoginUrl()} className="font-semibold text-primary hover:underline hover:underline-offset-2 transition-all">
            {isEn ? "Sign in" : "Se connecter"}
          </Link>
        )}
      </div>
    </>
  );
}
