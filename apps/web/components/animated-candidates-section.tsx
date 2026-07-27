"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { CandidatePhoto } from "./candidate-photo";
import { Badge } from "./ui/badge";
import { publicCandidatePath } from "../lib/site";
import type { PublicCandidate, PublicEvent } from "../app/e/[slug]/page";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 15 }
  }
};

function CandidateGridCard({ slug, c, isEn }: { slug: string; c: PublicCandidate; isEn: boolean }) {
  return (
    <motion.div variants={cardVariants} whileHover={{ y: -6, transition: { duration: 0.2 } }}>
      <Link
        href={publicCandidatePath(slug, c.publicRef)}
        className="group flex flex-col rounded-2xl border border-border/40 bg-card/60 overflow-hidden hover:shadow-2xl hover:border-primary/25 transition-all duration-300 relative aspect-[3/4]"
      >
        <div className="relative w-full h-full bg-muted overflow-hidden">
          <CandidatePhoto
            photoUrl={c.photoUrl}
            fullName={c.fullName}
            size="sm"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/85 via-neutral-950/30 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
          
          {c.number != null ? (
            <Badge className="absolute top-3.5 left-3.5 font-black text-sm px-3 py-1 shadow-md bg-background/90 text-foreground backdrop-blur-md border-none rounded-xl">
              N° {String(c.number).padStart(2, "0")}
            </Badge>
          ) : null}
          
          <div className="absolute bottom-0 left-0 w-full p-4 transform translate-y-1 group-hover:translate-y-0 transition-transform">
            <span className="block font-bold text-white text-base sm:text-lg leading-tight mb-1 truncate">{c.fullName}</span>
            <div className="flex items-center justify-between text-xs text-white/80 font-medium">
              <span>{c.voteCount.toLocaleString("fr-FR")} votes</span>
              <span className="inline-flex items-center text-primary relative after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 after:bg-primary after:transition-all group-hover:after:w-full font-bold">
                {isEn ? "Vote" : "Voter"}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function CandidateListRow({ slug, c }: { slug: string; c: PublicCandidate }) {
  return (
    <motion.div variants={cardVariants} whileHover={{ x: 4, transition: { duration: 0.2 } }}>
      <Link
        href={publicCandidatePath(slug, c.publicRef)}
        className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card/60 p-3.5 sm:p-4 hover:shadow-lg hover:border-primary/25 transition-all duration-300"
      >
        {c.number != null ? (
          <Badge className="font-black text-sm px-2.5 py-1 shrink-0 bg-primary/10 text-primary border-none rounded-xl">
            N° {String(c.number).padStart(2, "0")}
          </Badge>
        ) : null}
        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl overflow-hidden bg-muted shrink-0 relative border border-border/30">
          <CandidatePhoto photoUrl={c.photoUrl} fullName={c.fullName} size="sm" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block font-bold text-foreground text-base sm:text-lg leading-tight truncate">{c.fullName}</span>
          <span className="block text-xs sm:text-sm text-muted-foreground mt-0.5">{c.voteCount.toLocaleString("fr-FR")} votes</span>
        </div>
      </Link>
    </motion.div>
  );
}

function CandidateSpotlight({ slug, c, isEn }: { slug: string; c: PublicCandidate; isEn: boolean }) {
  return (
    <motion.div variants={cardVariants} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
      <Link
        href={publicCandidatePath(slug, c.publicRef)}
        className="group grid grid-cols-1 sm:grid-cols-2 rounded-3xl border border-border/40 bg-card/60 overflow-hidden hover:shadow-2xl hover:border-primary/30 transition-all duration-300 relative shadow-md"
      >
        <div className="relative aspect-[4/3] sm:aspect-auto sm:min-h-[300px] bg-muted overflow-hidden">
          <CandidatePhoto
            photoUrl={c.photoUrl}
            fullName={c.fullName}
            size="sm"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          {c.number != null ? (
            <Badge className="absolute top-4 left-4 font-black text-sm px-3.5 py-1.5 shadow-md bg-background/90 text-foreground backdrop-blur-md border-none rounded-xl">
              N° {String(c.number).padStart(2, "0")}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10">
          <Badge variant="outline" className="w-fit text-[10px] font-bold tracking-widest uppercase text-primary border-primary/30 bg-primary/5 mb-4 animate-pulse">
            {isEn ? "Featured Candidate" : "Candidat en Vedette"}
          </Badge>
          <span className="block font-extrabold text-foreground text-2xl sm:text-3xl tracking-tight leading-tight mb-2 truncate">{c.fullName}</span>
          <span className="block text-muted-foreground font-semibold mb-6">{c.voteCount.toLocaleString("fr-FR")} votes</span>
          <span className="inline-flex items-center text-primary font-bold relative after:absolute after:-bottom-0.5 after:left-0 after:h-[2px] after:w-0 after:bg-primary after:transition-all group-hover:after:w-full w-fit">
            {isEn ? "View Profile & Vote" : "Voir le profil & voter"}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

export function AnimatedCandidatesSection({
  slug,
  candidates,
  layout,
  isEn
}: {
  slug: string;
  candidates: PublicCandidate[];
  layout: PublicEvent["layout"];
  isEn: boolean;
}) {
  if (layout === "LIST") {
    return (
      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="visible" 
        className="flex flex-col gap-3"
      >
        {candidates.map((c) => (
          <CandidateListRow key={c.id} slug={slug} c={c} />
        ))}
      </motion.div>
    );
  }

  if (layout === "SPOTLIGHT" && candidates[0]) {
    const [featured, ...rest] = candidates;
    return (
      <div className="space-y-8">
        <CandidateSpotlight slug={slug} c={featured} isEn={isEn} />
        {rest.length > 0 ? (
          <motion.div 
            variants={containerVariants} 
            initial="hidden" 
            animate="visible" 
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6"
          >
            {rest.map((c) => (
              <CandidateGridCard key={c.id} slug={slug} c={c} isEn={isEn} />
            ))}
          </motion.div>
        ) : null}
      </div>
    );
  }

  // GRID (default)
  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="visible" 
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6"
    >
      {candidates.map((c) => (
        <CandidateGridCard key={c.id} slug={slug} c={c} isEn={isEn} />
      ))}
    </motion.div>
  );
}
