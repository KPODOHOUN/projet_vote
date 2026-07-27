"use client";

import { useState } from "react";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Photo d'un candidat avec repli initiales. Si `photoUrl` est absent ou que
 * l'image casse au chargement (`onError`), on affiche les initiales sur un fond
 * accent-teinté clair (texte ink lisible quelle que soit la couleur organisateur).
 */
export function CandidatePhoto({
  photoUrl,
  fullName,
  size,
  className = ""
}: {
  photoUrl: string | null;
  fullName: string;
  size: "sm" | "lg";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const cls = className || (size === "lg" ? "w-full h-full object-cover" : "w-full h-full object-cover");
  if (!photoUrl || broken) {
    return (
      <span className={`flex items-center justify-center bg-muted text-muted-foreground font-bold tracking-widest ${cls}`} data-placeholder="true" aria-hidden="true">
        {initials(fullName)}
      </span>
    );
  }
  // Pour les URLs Cloudinary, servir une image dimensionnée + auto format/qualité
  // (insère une transformation dans le chemin /upload/). Autres URLs inchangées.
  const width = size === "lg" ? 640 : 160;
  const src =
    photoUrl.includes("res.cloudinary.com") && photoUrl.includes("/upload/")
      ? photoUrl.replace("/upload/", `/upload/w_${width},c_fill,f_auto,q_auto/`)
      : photoUrl;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cls} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />;
}
