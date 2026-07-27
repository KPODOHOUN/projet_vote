export interface TrustBadgeProps {
  label?: string;
}

export function TrustBadge({ label = "Concours certifie et verifie" }: TrustBadgeProps) {
  return (
    <div aria-label={label} className="vp-ui vp-badge" role="status">
      <span aria-hidden className="vp-badge-mark">
        ●
      </span>
      <span>{label}</span>
    </div>
  );
}
