"use client";

import { useEffect, useState } from "react";

import { useI18n } from "../lib/i18n-provider";
import { countdownParts } from "../lib/minisite-style";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Compte à rebours jusqu'à `target` (fin ou ouverture du vote), calculé depuis
 * la date stockée de l'événement. Le premier rendu utilise l'instant `now` du
 * serveur (même balisage des deux côtés), puis se met à jour toutes les 30 s.
 * Échéance atteinte : rien n'est affiché (la page recalcule la phase au rechargement).
 */
export function VoteCountdown({
  target,
  now,
  variant
}: {
  target: string;
  now: number;
  /** "inline" : « 6 j 14 h 32 min » ; "cells" : trois cases ; "board" : tableau de score. */
  variant: "inline" | "cells" | "board";
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(now);

  useEffect(() => {
    setCurrent(Date.now());
    const id = window.setInterval(() => setCurrent(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const parts = countdownParts(target, current);
  if (!parts) return null;

  if (variant === "inline") {
    return (
      <span className="whitespace-nowrap normal-case tabular-nums">
        {t("countdown.short", { d: String(parts.days), h: String(parts.hours), m: String(parts.minutes) })}
      </span>
    );
  }

  if (variant === "board") {
    const units: Array<[number, string]> = [
      [parts.days, t("countdown.days")],
      [parts.hours, t("countdown.hours")],
      [parts.minutes, t("countdown.minutes")]
    ];
    return (
      <div className="inline-flex items-stretch gap-1.5 rounded-sm bg-black p-1.5">
        {units.map(([value, label], index) => (
          <div key={label} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true" className="font-mono text-2xl font-bold text-white/40">:</span> : null}
            <div className="min-w-[3.6rem] rounded-sm bg-neutral-900 px-2.5 py-2 text-center">
              <span className="block font-mono text-[34px] font-bold leading-none text-[var(--event-accent-bright)] tabular-nums">{pad(value)}</span>
              <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/60">{label}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cells: Array<[number, string]> = [
    [parts.days, t("countdown.days")],
    [parts.hours, t("countdown.hours")],
    [parts.minutes, t("countdown.minutes")]
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {cells.map(([value, label]) => (
        <div key={label} className="rounded-md bg-[var(--mini-wash)] px-2 py-4 text-center">
          <span className="mini-title block text-[clamp(36px,4vw,52px)] leading-none text-[var(--mini-accent)] tabular-nums">
            {pad(value)}
          </span>
          <span className="mt-2 block text-[10px] uppercase tracking-[0.2em] text-[var(--mini-muted)]">{label}</span>
        </div>
      ))}
    </div>
  );
}
