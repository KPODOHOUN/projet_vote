import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type DashboardBreadcrumbProps = {
  items: BreadcrumbItem[];
  isEn?: boolean;
};

export function DashboardBreadcrumb({ items, isEn = false }: DashboardBreadcrumbProps) {
  return (
    <nav aria-label={isEn ? "Breadcrumb" : "Fil d'Ariane"} className="mb-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <li>
          <Link href="/dashboard" className="hover:text-foreground">
            {isEn ? "Dashboard" : "Tableau de bord"}
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
