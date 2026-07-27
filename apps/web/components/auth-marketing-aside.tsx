"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type AuthMarketingAsideProps = {
  isEn?: boolean;
  variant?: "login" | "register" | "vote" | "recovery";
  children: ReactNode;
};

const IMAGES = {
  login: "/slider/organizer-control.png",
  register: "/slider/mobile-voters.png",
  vote: "/slider/contest-night.png",
  recovery: "/slider/contest-night.png"
} as const;

export function AuthMarketingAside({ isEn = false, variant = "login", children }: AuthMarketingAsideProps) {
  const image = IMAGES[variant];
  return (
    <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-end">
      <div className="absolute inset-0" aria-hidden="true">
        <Image src={image} alt="" fill className="object-cover" priority sizes="(min-width: 768px) 45vw, 100vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/85 to-zinc-950/50" />
      </div>
      <div className="relative z-10 p-8 text-zinc-50 md:p-12 lg:p-16">{children}</div>
      <p className="relative z-10 px-8 pb-6 text-xs text-zinc-400 md:px-12 lg:px-16">
        {isEn ? "Secure voting platform for West Africa" : "Plateforme de vote sécurisée pour l'Afrique de l'Ouest"}
      </p>
    </div>
  );
}
