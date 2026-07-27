import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Légère élévation au survol */
  hover?: boolean;
  /** Intensité du verre */
  intensity?: "default" | "strong" | "subtle";
};

const intensityClass = {
  default: "vp-glass",
  strong: "vp-glass-strong",
  subtle: "vp-glass-subtle"
} as const;

export function GlassCard({
  children,
  className,
  hover = false,
  intensity = "default",
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl",
        intensityClass[intensity],
        hover && "vp-glass-hover transition-all duration-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
