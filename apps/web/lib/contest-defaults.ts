/** Fenêtre par défaut : maintenant → +30 jours (dates masquées à l'utilisateur). */
export function defaultContestWindow(): { startsAtIso: string; endsAtIso: string } {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return { startsAtIso: start.toISOString(), endsAtIso: end.toISOString() };
}
