import Link from "next/link";
import { translate, translateVars, type Locale } from "../lib/i18n";
import type { VotePhase } from "../lib/vote-phase";

/**
 * Message de phase (7.11-c) : remplace le formulaire de vote quand le vote
 * n'est pas ouvert. Rien n'est affiché pendant la phase « open ».
 */
export function PhaseNotice({
  phase,
  locale,
  startLabel,
  resultsHref
}: {
  phase: VotePhase;
  locale: Locale;
  startLabel: string;
  resultsHref: string;
}) {
  if (phase === "open") return null;

  const message =
    phase === "upcoming"
      ? translateVars(locale, "phase.msg.upcoming", { date: startLabel })
      : phase === "draft"
        ? translate(locale, "phase.msg.draft")
        : translate(locale, "phase.msg.ended");
  // La branche « vote pas ouvert » (draft) gardait déjà son lien vers les résultats.
  const showResults = phase !== "upcoming";

  return (
    <div
      role="status"
      className="rounded-md border border-[var(--color-info)]/30 bg-[var(--color-info)]/10 px-4 py-3 text-sm text-[var(--color-info-text)]"
    >
      <p>
        {message}
        {showResults ? (
          <>
            {" "}
            <Link href={resultsHref} className="font-semibold underline underline-offset-4">
              {translate(locale, "phase.seeResults")}
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
