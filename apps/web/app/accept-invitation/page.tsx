import Link from "next/link";
import { getServerLocale } from "../../lib/locale-server";
import { authLoginUrl } from "../../lib/auth-navigation";
import { Button } from "@/components/ui";
import { AuthSimpleLayout } from "../../components/auth-simple-layout";
import { GlassCard } from "../../components/glass-card";

export const metadata = {
  title: "Invitation invalide",
  robots: { index: false, follow: false }
};

export default async function AcceptInvitationMissingTokenPage() {
  const locale = await getServerLocale();
  const isEn = locale === "en";

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <GlassCard intensity="strong" className="w-full p-6 text-center sm:p-8">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary">
          {isEn ? "Invitation" : "Invitation"}
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {isEn ? "Invalid invitation link" : "Lien d'invitation invalide"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isEn
            ? "Open the full link from your invitation email. It should look like /accept-invitation/…"
            : "Utilisez le lien complet reçu par e-mail. Il doit ressembler à /accept-invitation/…"}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="w-full sm:w-auto">
            <Link href={authLoginUrl()}>{isEn ? "Sign in" : "Se connecter"}</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/">{isEn ? "Home" : "Accueil"}</Link>
          </Button>
        </div>
      </GlassCard>
    </AuthSimpleLayout>
  );
}
