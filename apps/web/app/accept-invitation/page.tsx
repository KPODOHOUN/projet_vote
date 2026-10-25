import Link from "next/link";
import { getServerLocale } from "../../lib/locale-server";
import { authLoginUrl } from "../../lib/auth-navigation";
import { Button, Card } from "@/components/ui";
import { AuthSimpleLayout } from "../../components/auth-simple-layout";

export const metadata = {
  title: "Invitation invalide",
  robots: { index: false, follow: false }
};

export default async function AcceptInvitationMissingTokenPage() {
  const locale = await getServerLocale();
  const isEn = locale === "en";

  return (
    <AuthSimpleLayout contentClassName="max-w-[420px]">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {isEn ? "Invalid invitation link" : "Lien d'invitation invalide"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {isEn
            ? "Open the full link from your invitation email. It should look like /accept-invitation/…"
            : "Utilisez le lien complet reçu par e-mail. Il doit ressembler à /accept-invitation/…"}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="h-12 w-full sm:w-auto">
            <Link href={authLoginUrl()}>{isEn ? "Sign in" : "Se connecter"}</Link>
          </Button>
          <Button asChild variant="secondary" className="h-12 w-full sm:w-auto">
            <Link href="/">{isEn ? "Home" : "Accueil"}</Link>
          </Button>
        </div>
      </Card>
    </AuthSimpleLayout>
  );
}
