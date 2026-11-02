import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Légère élévation au survol */
  hover?: boolean;
  /** Intensité du verre */
  intensity?: "default" | "strong" | "subtle";
};

export function GlassCard({
  children,
  className,
  hover = false,
  // Extraite pour ne pas être transmise au <div> via ...props (prop conservée pour compatibilité).
  intensity: _intensity = "default",
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card",
        hover && "vp-glass-hover transition-all duration-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
