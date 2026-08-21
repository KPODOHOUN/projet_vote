"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { setStoredToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-provider";
import { Button, LoadingState } from "@/components/ui";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";

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
      <GlassCard intensity="strong" className="w-full p-6 text-center sm:p-8">
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-error)]/10">
              <XCircle className="h-7 w-7 text-[var(--color-error-text)]" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("auth.oauth.callbackErrorTitle")}
            </h1>
            <p role="alert" className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {error}
            </p>
            <Button asChild className="mt-6 w-full">
              <Link href="/">{t("auth.oauth.backHome")}</Link>
            </Button>
          </>
        ) : (
          <LoadingState label={t("auth.oauth.callbackLoading")} />
        )}
      </GlassCard>
    </AuthSimpleLayout>
  );
}
