type ChipTone =
  | "live"
  | "active"
  | "pending"
  | "paused"
  | "success"
  | "warning"
  | "error"
  | "draft"
  | "muted";

export interface StatusChipProps {
  label: string;
  tone: ChipTone;
}

export function StatusChip({ label, tone }: StatusChipProps) {
  return <span className={`vp-ui vp-chip vp-chip-${tone}`}>{label}</span>;
}
