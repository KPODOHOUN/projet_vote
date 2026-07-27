import Link from "next/link";
import { getServerLocale } from "../lib/locale-server";
import { Button } from "@/components/ui";

export default async function NotFoundPage() {
  const locale = await getServerLocale();
  const isEn = locale === "en";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-primary">404</p>
      <h1 className="mt-4 max-w-lg text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {isEn ? "Page not found" : "Page introuvable"}
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        {isEn
          ? "This link may be outdated, mistyped, or the resource no longer exists."
          : "Ce lien est peut-être incorrect, expiré, ou la ressource n'existe plus."}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/">{isEn ? "Back to home" : "Retour à l'accueil"}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/vote">{isEn ? "Enter event code" : "Entrer un code évènement"}</Link>
        </Button>
      </div>
    </main>
  );
}
