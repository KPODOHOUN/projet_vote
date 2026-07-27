type Trend = "up" | "down" | "flat";

export interface KpiCardProps {
  label: string;
  value: string;
  trend?: Trend;
  trendLabel?: string;
}

export function KpiCard({ label, value, trend = "flat", trendLabel }: KpiCardProps) {
  return (
    <article className="vp-ui vp-kpi">
      <p className="vp-kpi-label">{label}</p>
      <p className="vp-kpi-value">{value}</p>
      {trendLabel ? <p className={`vp-kpi-trend vp-kpi-${trend}`}>{trendLabel}</p> : null}
    </article>
  );
}
