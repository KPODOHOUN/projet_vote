"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ListTodo,
  Settings,
  Menu,
  Wrench,
  ScrollText,
  Gavel,
  Banknote,
  CalendarDays,
  Percent,
  Tags
} from "lucide-react";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n-provider";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { title: string; items: NavItem[] };

export function AdminSidebar() {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  // Sous lg la barre est un tiroir : toujours affichée en entier (libellés compris).
  const isCollapsed = false;
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  const sections = useMemo((): NavSection[] => {
    return [
      {
        title: isEn ? "Money" : "Argent",
        items: [
          { href: "/admin", label: isEn ? "Overview" : "Vue d'ensemble", icon: LayoutDashboard },
          { href: "/admin/offers", label: isEn ? "Commission & reserve" : "Commission et réserve", icon: Percent },
          { href: "/admin/offers/events", label: isEn ? "Active events" : "Événements actifs", icon: CalendarDays },
          { href: "/admin/offers/withdrawals", label: isEn ? "Withdrawals" : "Retraits", icon: Banknote }
        ]
      },
      {
        title: isEn ? "Users" : "Utilisateurs",
        items: [
          { href: "/admin/users", label: t("nav.adminUsers"), icon: Users }
        ]
      },
      {
        title: isEn ? "Platform" : "Plateforme",
        items: [
          { href: "/admin/votes", label: isEn ? "Vote moderation" : "Modération votes", icon: Gavel },
          { href: "/admin/jobs", label: t("nav.jobs"), icon: ListTodo },
          { href: "/admin/maintenance", label: isEn ? "Maintenance" : "Maintenance", icon: Wrench },
          { href: "/admin/audit", label: isEn ? "Audit log" : "Journal d'audit", icon: ScrollText },
          { href: "/admin/display-partners", label: isEn ? "Partners shown on the site" : "Partenaires affichés sur le site", icon: Tags },
          { href: "/admin/settings", label: isEn ? "Settings" : "Réglages", icon: Settings }
        ]
      }
    ];
  }, [t, isEn]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? (isEn ? "Close menu" : "Fermer") : isEn ? "Open menu" : "Ouvrir"}
        aria-expanded={isMobileOpen}
        className="fixed left-4 top-2.5 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-dvh flex-col border-r border-gold-500/15 bg-card transition-all duration-300",
          isCollapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-border p-6">
          {isCollapsed ? (
            <span className="text-lg font-extrabold tracking-tight text-slate-900" aria-label="SHADOMA">S</span>
          ) : (
            <div>
              <p className="truncate text-lg font-extrabold tracking-tight text-slate-900">SHADOMA</p>
              <p className="text-xs font-medium text-gold-700">{isEn ? "Platform admin" : "Admin plateforme"}</p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => {
            return (
            <div key={section.title} className="space-y-1">
              {!isCollapsed && (
                <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : item.href === "/admin/offers"
                      ? pathname === "/admin/offers"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-all active:scale-[0.97] active:opacity-80",
                      isActive
                        ? "border-l-2 border-gold-500 bg-gold-500/10 text-gold-700 shadow-sm"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    <span className="relative shrink-0">
                      <Icon className={cn("h-5 w-5", isActive && "text-gold-600")} />
                    </span>
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>

      </aside>

      <div className={cn("hidden shrink-0 lg:block", isCollapsed ? "w-20" : "w-64")} />

      {isMobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
    </>
  );
}
