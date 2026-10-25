/**
 * Phase de vote d'un concours (7.11-c). Le serveur reste l'autorité : il refuse
 * tout vote hors [startsAt, endsAt] ; l'interface s'en sert seulement pour ne pas
 * promettre un vote que l'API refusera. `now` est lu à chaque rendu (no-store).
 */
export type VotePhase = "upcoming" | "open" | "ended" | "closed" | "draft";

export type VotePhaseInput = {
  status: string;
  startsAt: string | Date | null | undefined;
  endsAt: string | Date | null | undefined;
};

function toTime(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getVotePhase(event: VotePhaseInput, now: Date = new Date()): VotePhase {
  const status = event.status.toUpperCase();
  if (status === "CLOSED" || status === "ARCHIVED") return "closed";
  if (status !== "ACTIVE") return "draft";

  const start = toTime(event.startsAt);
  const end = toTime(event.endsAt);
  // Dates illisibles : on ne promet rien.
  if (start === null || end === null) return "draft";

  const current = now.getTime();
  if (current < start) return "upcoming";
  if (current > end) return "ended";
  return "open";
}
