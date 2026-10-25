"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setStoredToken } from "@/lib/auth";
import { authLoginUrl } from "@/lib/auth-navigation";
import { useI18n } from "@/lib/i18n-provider";
import { Button, Card, FormError, LoadingState } from "@/components/ui";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";

type CallbackResponse = {
  accessToken: string;
};

export default function OAuthCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const callbackStarted = useRef(false);

  useEffect(() => {
    const provider = params.provider as string;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (provider !== "google" || !code || !state) {
      setError(t("auth.oauth.callbackInvalid"));
      return;
    }
    if (callbackStarted.current) return;
    callbackStarted.current = true;

    apiFetch<CallbackResponse>("/auth/oauth/callback", {
      method: "POST",
      body: JSON.stringify({ provider, code, state }),
    })
      .then((result) => {
        setStoredToken(result.accessToken);
        router.push("/dashboard");
      })
      .catch((err) => {
        setError(err.message || t("auth.oauth.callbackFailed"));
      });
  }, [params, searchParams, router, t]);

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        {error ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("auth.oauth.callbackErrorTitle")}</h1>
            <FormError className="mt-3">{error}</FormError>
            {/* Erreur récupérable : retour à la modale de connexion (7.5). */}
            <Button asChild className="mt-6 h-12 w-full">
              <Link href={authLoginUrl()}>{t("auth.oauth.retryLogin")}</Link>
            </Button>
            <Link href="/" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t("auth.oauth.backHome")}
            </Link>
          </>
        ) : (
          <LoadingState label={t("auth.oauth.callbackLoading")} />
        )}
      </Card>
    </AuthSimpleLayout>
  );
}
