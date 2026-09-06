"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Flag,
  ListTodo,
  Settings,
  Menu,
  Wrench,
  ScrollText,
  Gavel,
  Banknote,
  CreditCard,
  CalendarDays,
  Tags,
  ChevronDown,
  Archive,
  IdCard
} from "lucide-react";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n-provider";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { title: string; items: NavItem[]; legacy?: boolean };

export function AdminSidebar() {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsCollapsed(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  const sections = useMemo((): NavSection[] => {
    return [
      {
        title: isEn ? "Offers & money" : "Offres & argent",
        items: [
          { href: "/admin", label: isEn ? "Overview" : "Vue d'ensemble", icon: LayoutDashboard },
          { href: "/admin/offers", label: isEn ? "Offers & pricing" : "Offres & tarifs", icon: Tags },
          { href: "/admin/offers/events", label: isEn ? "Active events" : "Événements actifs", icon: CalendarDays },
          { href: "/admin/offers/withdrawals", label: isEn ? "Withdrawals" : "Retraits", icon: Banknote },
          { href: "/admin/subscriptions", label: t("nav.subscriptions"), icon: IdCard }
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
          { href: "/admin/feature-flags", label: t("nav.featureFlags"), icon: Flag },
          { href: "/admin/maintenance", label: isEn ? "Maintenance" : "Maintenance", icon: Wrench },
          { href: "/admin/audit", label: isEn ? "Audit log" : "Journal d'audit", icon: ScrollText },
          { href: "/admin/settings", label: isEn ? "Settings" : "Réglages", icon: Settings }
        ]
      },
      {
        title: isEn ? "Legacy" : "Hérité",
        legacy: true,
        items: [
          { href: "/admin/partners", label: isEn ? "Partners" : "Partenaires", icon: CreditCard },
          { href: "/admin/account-partners", label: isEn ? "Partner requests" : "Demandes partenaire", icon: Users },
          { href: "/admin/display-partners", label: isEn ? "Display partners" : "Partenaires affichage", icon: Tags },
          { href: "/admin/payouts", label: isEn ? "Legacy payouts" : "Versements (legacy)", icon: Archive }
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
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm lg:hidden"
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-gold-700 font-bold text-white shadow-sm">
            AD
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">SHADOMA</h1>
              <p className="text-[11px] font-medium text-gold-700/80">
                {isEn ? "Platform admin" : "Admin plateforme"}
              </p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => {
            const isLegacy = section.legacy === true;
            const sectionCollapsed = isLegacy && !legacyOpen;
            const legacyActive = isLegacy && section.items.some((item) =>
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            );

            return (
            <div key={section.title} className="space-y-1">
              {!isCollapsed && (
                isLegacy ? (
                  <button
                    type="button"
                    onClick={() => setLegacyOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-2 px-4 pb-1 text-left"
                    aria-expanded={legacyOpen}
                  >
                    <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {section.title}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-muted-foreground">
                        {isEn ? "Deprecated" : "Déprécié"}
                      </span>
                    </span>
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", legacyOpen && "rotate-180")} aria-hidden="true" />
                  </button>
                ) : (
                  <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {section.title}
                  </p>
                )
              )}
              {(!isLegacy || legacyOpen) && section.items.map((item) => {
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
              {isLegacy && sectionCollapsed && !isCollapsed && legacyActive ? (
                <p className="px-4 py-1 text-xs text-muted-foreground">
                  {isEn ? "Legacy section collapsed — expand to navigate." : "Section repliée — développez pour naviguer."}
                </p>
              ) : null}
            </div>
            );
          })}
        </nav>

        {!isCollapsed && (
          <p className="mx-4 mb-4 rounded-lg border border-gold-500/20 bg-gold-500/5 px-3 py-2 text-xs text-muted-foreground">
            {isEn ? "Operator area only." : "Espace opérateur uniquement."}
          </p>
        )}
      </aside>

      <div className={cn("hidden shrink-0 lg:block", isCollapsed ? "w-20" : "w-64")} />

      {isMobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
    </>
  );
}
