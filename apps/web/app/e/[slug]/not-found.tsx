import Link from "next/link";
import { getServerLocale } from "../../../lib/locale-server";
import { Button } from "@/components/ui";

export default async function EventNotFoundPage() {
  const locale = await getServerLocale();
  const isEn = locale === "en";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-primary">
        {isEn ? "Event not found" : "Évènement introuvable"}
      </p>
      <h1 className="mt-4 max-w-lg text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {isEn ? "This contest is not available" : "Ce concours n'est pas disponible"}
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        {isEn
          ? "Check the link shared by the organizer or search for the event code."
          : "Vérifiez le lien partagé par l'organisateur ou recherchez le code du concours."}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/vote">{isEn ? "Enter event code" : "Entrer le code"}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/">{isEn ? "Home" : "Accueil"}</Link>
        </Button>
      </div>
    </main>
  );
}
