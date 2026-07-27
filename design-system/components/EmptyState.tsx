import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <section className="vp-ui vp-empty">
      {icon ? <div aria-hidden>{icon}</div> : null}
      <h3 className="vp-empty-title">{title}</h3>
      <p className="vp-empty-description">{description}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
