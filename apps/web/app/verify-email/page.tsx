"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { Button, Card, LoadingState } from "@/components/ui";

function VerifyEmailContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    void apiFetch<{ success: boolean }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    })
      .then(() => setStatus("ok"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8" role="status" aria-live="polite">
        {status === "loading" ? <LoadingState label={t("verifyEmail.loading")} /> : null}
        {status === "ok" ? (
          <>
            <h1 className="mb-2 text-2xl font-bold text-slate-900">{t("verifyEmail.okTitle")}</h1>
            <p className="mb-6 text-slate-600">{t("verifyEmail.okDesc")}</p>
            <Button asChild className="h-12 w-full">
              <Link href={authLoginUrl()}>{t("verifyEmail.signIn")}</Link>
            </Button>
          </>
        ) : null}
        {status === "error" ? (
          <>
            <h1 className="mb-2 text-2xl font-bold text-slate-900">{t("verifyEmail.errorTitle")}</h1>
            <p className="mb-6 text-slate-600">{t("verifyEmail.errorDesc")}</p>
            <Button asChild variant="secondary" className="h-12 w-full">
              <Link href="/check-email">{t("verifyEmail.resend")}</Link>
            </Button>
          </>
        ) : null}
      </Card>
    </AuthSimpleLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
