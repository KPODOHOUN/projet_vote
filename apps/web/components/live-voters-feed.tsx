"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type SimulatedVote = {
  id: string;
  name: string;
  country: string;
  flag: string;
  candidate: string;
  count: number;
  amount: number;
};

function formatFCFA(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

const INITIAL_VOTES: SimulatedVote[] = [
  { id: "seed-1", name: "Awa D.", country: "S\u00e9n\u00e9gal", flag: "\ud83c\uddf8\ud83c\uddf3", candidate: "#1", count: 50, amount: 5000 },
  { id: "seed-2", name: "Jean-Marc K.", country: "C\u00f4te d'Ivoire", flag: "\ud83c\udde8\ud83c\uddee", candidate: "#3", count: 23, amount: 2300 },
  { id: "seed-3", name: "Mariam O.", country: "Mali", flag: "\ud83c\uddf2\ud83c\uddf1", candidate: "#5", count: 12, amount: 1200 },
  { id: "seed-4", name: "Koffi A.", country: "Togo", flag: "\ud83c\uddf9\ud83c\uddec", candidate: "#2", count: 8, amount: 800 },
  { id: "seed-5", name: "Fatim B.", country: "B\u00e9nin", flag: "\ud83c\udde7\ud83c\uddef", candidate: "#4", count: 5, amount: 500 },
];

export function LiveVotersFeed({ isEn }: { isEn: boolean }) {
  const [votes] = useState<SimulatedVote[]>(INITIAL_VOTES);

  return (
    <div className="vp-glass rounded-2xl border border-primary/15 p-5 bg-background/40">
      <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
            {isEn ? "Live Vote Stream" : "Flux de Votes"}
          </h3>
        </div>
        <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-500">
          {isEn ? "LIVE" : "EN DIRECT"}
        </span>
      </div>

      <div className="space-y-2.5 overflow-hidden min-h-[200px]">
        <AnimatePresence initial={false}>
          {votes.map((vote) => (
            <motion.div
              key={vote.id}
              initial={{ opacity: 0, y: -16, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <div className="group flex items-center justify-between rounded-xl border border-border/20 bg-card/30 p-3 transition-all hover:border-primary/20 hover:bg-card/50">
                <div className="flex items-center gap-3">
                  <span className="text-lg" role="img" aria-label={vote.country}>{vote.flag}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">{vote.name}</span>
                      <span className="text-[10px] text-muted-foreground">{vote.country}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isEn ? "for candidate" : "candidate"}{" "}
                      <span className="font-semibold text-primary">{vote.candidate}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block text-sm font-black text-foreground">+{vote.count}</span>
                  <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    {formatFCFA(vote.amount)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
