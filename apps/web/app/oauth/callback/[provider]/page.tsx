"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setStoredToken } from "@/lib/auth";

type CallbackResponse = {
  accessToken: string;
};

export default function OAuthCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = params.provider as string;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!provider || !code || !state) {
      setError("Réponse OAuth invalide. Veuillez réessayer.");
      return;
    }

    apiFetch<CallbackResponse>("/auth/oauth/callback", {
      method: "POST",
      body: JSON.stringify({ provider, code, state }),
    })
      .then((result) => {
        setStoredToken(result.accessToken);
        router.push("/dashboard");
      })
      .catch((err) => {
        setError(err.message || "La connexion via OAuth a échoué.");
      });
  }, [params, searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-destructive">Connexion impossible</p>
        <p className="text-muted-foreground">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-muted-foreground">Connexion en cours...</p>
    </div>
  );
}
