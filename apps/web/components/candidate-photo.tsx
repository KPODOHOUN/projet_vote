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
 * aplat --event-accent-strong (texte blanc ≥ 4,5:1 garanti par le moteur de thème).
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
      <span
        className={`flex items-center justify-center font-bold tracking-widest text-white ${cls}`}
        style={{ background: "var(--event-accent-strong, var(--color-brand-600))" }}
        data-placeholder="true"
        aria-hidden="true"
      >
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
