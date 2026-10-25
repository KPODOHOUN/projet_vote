import Link from "next/link";
import { getServerLocale } from "../../../lib/locale-server";
import { translate } from "../../../lib/i18n";
import { Button } from "@/components/ui";

export default async function EventNotFoundPage() {
  const locale = await getServerLocale();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <p className="text-sm font-semibold text-slate-600">
        {translate(locale, "pub.voteNotFound")}
      </p>
      <h1 className="mt-4 max-w-lg text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {translate(locale, "pub.notFoundTitle")}
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        {translate(locale, "pub.notFoundDesc")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/vote">{translate(locale, "pub.enterCode")}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/">{translate(locale, "pub.home")}</Link>
        </Button>
      </div>
    </main>
  );
}
