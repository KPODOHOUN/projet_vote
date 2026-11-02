"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { Button, Card, FormError, Input } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

type ForgotPasswordResponse = {
  success: boolean;
  message?: string;
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await apiFetch<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() })
      });
      showToast.success(t("authpages.42"));
      const params = new URLSearchParams({ email: email.trim() });
      router.push(`/reset-password?${params.toString()}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("authpages.43")
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        <p className="mb-2 text-sm font-semibold text-slate-600">
          {t("authpages.44")}
        </p>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t("login.forgot")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {t("authpages.45")}
        </p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="email"
            label={t("login.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <FormError>{error}</FormError>
          <Button type="submit" loading={isLoading} className="w-full">
            {t("authpages.46")}
          </Button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href={authLoginUrl()} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("authpages.47")}
          </Link>
        </p>
      </Card>
    </AuthSimpleLayout>
  );
}
