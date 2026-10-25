import { BRAND_ICONS, type BrandIconId } from "../lib/brand-icons";

/** Logo officiel d'un réseau (tracé Simple Icons), en couleur pleine. */
export function BrandIcon({ id, className = "h-6 w-6", color = "currentColor" }: { id: BrandIconId; className?: string; color?: string }) {
  const icon = BRAND_ICONS[id];
  return (
    <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden="true" focusable="false">
      <path d={icon.path} />
    </svg>
  );
}
