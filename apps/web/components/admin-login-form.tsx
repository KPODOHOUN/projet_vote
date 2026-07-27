"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Shield } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api";
import { setStoredToken } from "../lib/auth";
import { showToast } from "../lib/toast";
import { useI18n } from "../lib/i18n-provider";
import { useAuth } from "../lib/auth-context";
import { Button, Input, FormError } from "@/components/ui";

type LoginResponse = {
  accessToken: string;
};

export function AdminLoginForm() {
  const router = useRouter();
  const { locale } = useI18n();
  const { refreshUser } = useAuth();
  const isEn = locale === "en";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError(isEn ? "Email and password are required." : "Email et mot de passe requis.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setStoredToken(result.accessToken);
      const me = await apiFetch<{ role: string }>("/auth/me", {
        headers: { Authorization: `Bearer ${result.accessToken}` }
      });
      const isAdmin = me.role === "PLATFORM_ADMIN" || me.role === "PLATFORM_SUPER_ADMIN";
      if (!isAdmin) {
        setError(isEn ? "This area is reserved for platform administrators." : "Cet espace est réservé aux administrateurs de la plateforme.");
        setIsLoading(false);
        return;
      }
      showToast.success(isEn ? "Welcome back." : "Bon retour.");
      await refreshUser();
      router.replace("/admin");
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 401) {
        setError(isEn ? "Invalid email or password." : "Email ou mot de passe incorrect.");
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : isEn
              ? "Connection failed."
              : "Connexion échouée."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {isEn ? "Admin access" : "Accès administrateur"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEn ? "Sign in with your administrator account." : "Connectez-vous avec votre compte administrateur."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input
            ref={emailRef}
            id="adminEmail"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <div className="relative">
            <Input
              ref={passwordRef}
              id="adminPassword"
              label={isEn ? "Password" : "Mot de passe"}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-3 top-9 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" loading={isLoading} className="w-full h-11 font-semibold">
            {isEn ? "Sign in" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            {isEn ? "← Back to SHADOMA" : "← Retour sur SHADOMA"}
          </Link>
        </p>
      </div>
    </div>
  );
}
