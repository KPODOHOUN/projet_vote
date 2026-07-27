import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AmbientBackdropProps = {
  children: ReactNode;
  className?: string;
  /** Plus d'orbs pour les pages marketing */
  variant?: "subtle" | "rich";
};

/** Fond décoratif : orbes dégradés + mesh léger (glassmorphism context). */
export function AmbientBackdrop({ children, className, variant = "subtle" }: AmbientBackdropProps) {
  return (
    <div className={cn("vp-ambient-page relative isolate min-h-full", className)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="vp-orb vp-orb-blue -left-24 top-0 h-[28rem] w-[28rem]" />
        <div className="vp-orb vp-orb-cyan right-0 top-1/4 h-[22rem] w-[22rem]" />
        {variant === "rich" ? (
          <>
            <div className="vp-orb vp-orb-blue bottom-0 left-1/3 h-[20rem] w-[20rem] opacity-60" />
            <div className="vp-orb vp-orb-cyan -right-16 bottom-1/4 h-[16rem] w-[16rem] opacity-50" />
          </>
        ) : null}
        <div className="absolute inset-0 vp-mesh-overlay" />
      </div>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
