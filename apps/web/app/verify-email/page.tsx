"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useI18n } from "../../lib/i18n-provider";
import { authLoginUrl } from "../../lib/auth-navigation";
import { AuthSimpleLayout } from "@/components/auth-simple-layout";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui";

function VerifyEmailContent() {
  const { locale } = useI18n();
  const isEn = locale === "en";
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
      <GlassCard intensity="strong" className="w-full p-8 text-center">
        {status === "loading" ? (
          <p className="text-muted-foreground">{isEn ? "Verifying…" : "Vérification en cours…"}</p>
        ) : null}
        {status === "ok" ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" aria-hidden="true" />
            <h1 className="mb-2 text-2xl font-bold">{isEn ? "Email confirmed!" : "E-mail confirmé !"}</h1>
            <p className="mb-6 text-muted-foreground">
              {isEn ? "Your account is active. You can sign in now." : "Votre compte est actif. Vous pouvez vous connecter."}
            </p>
            <Button asChild className="w-full">
              <Link href={authLoginUrl()}>{isEn ? "Sign in" : "Se connecter"}</Link>
            </Button>
          </>
        ) : null}
        {status === "error" ? (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
            <h1 className="mb-2 text-2xl font-bold">{isEn ? "Invalid link" : "Lien invalide"}</h1>
            <p className="mb-6 text-muted-foreground">
              {isEn ? "This confirmation link expired or was already used." : "Ce lien a expiré ou a déjà été utilisé."}
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/check-email">{isEn ? "Resend email" : "Renvoyer l'e-mail"}</Link>
            </Button>
          </>
        ) : null}
      </GlassCard>
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
