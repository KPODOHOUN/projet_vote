"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Menu,
  UserPlus,
  CircleUser,
  Bell,
  Shield,
  CreditCard,
  Ticket,
  Search
} from "lucide-react";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n-provider";
import { useAuth } from "../lib/auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  className?: string;
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const { isPlatformAdmin } = useAuth();
  const isEn = locale === "en";
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsCollapsed(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  const navItems = useMemo(() => {
    const items: NavItem[] = [
      { href: "/dashboard", label: t("nav.overview"), icon: LayoutDashboard },
      { href: "/dashboard/events", label: t("nav.events"), icon: Calendar },
      { href: "/dashboard/ticketing", label: isEn ? "Ticketing" : "Billetterie", icon: Ticket },
      { href: "/dashboard/search", label: isEn ? "Search" : "Recherche", icon: Search },
      { href: "/dashboard/team", label: t("nav.team"), icon: UserPlus },
      { href: "/dashboard/account", label: t("nav.account"), icon: CircleUser },
      { href: "/dashboard/subscription", label: isEn ? "Subscription" : "Mon abonnement", icon: CreditCard },
      { href: "/dashboard/notifications", label: t("nav.notifications"), icon: Bell }
    ];
    if (isPlatformAdmin) {
      items.push({
        href: "/admin",
        label: isEn ? "Platform admin" : "Admin plateforme",
        icon: Shield,
        className: "mt-auto border-t border-border pt-4"
      });
    }
    return items;
  }, [t, isPlatformAdmin, isEn]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? (isEn ? "Close menu" : "Fermer") : isEn ? "Open menu" : "Ouvrir"}
        aria-expanded={isMobileOpen}
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-all hover:bg-accent lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-dvh flex-col border-r border-border bg-card transition-all duration-300",
          isCollapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex shrink-0 items-center gap-4 overflow-hidden border-b border-border p-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 font-bold text-white shadow-sm">
            SV
          </div>
          {!isCollapsed && (
            <div className="transition-opacity duration-300">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">SHADOMA</h1>
              <p className="text-[11px] font-medium text-muted-foreground">
                {isEn ? "Organizer workspace" : "Espace organisateur"}
              </p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            const isAdminLink = item.href === "/admin";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isActive
                    ? isAdminLink
                      ? "border-l-2 border-gold-500 bg-gold-500/10 text-gold-700 dark:text-gold-400"
                      : "border-l-2 border-primary bg-primary/8 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  item.className
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", isActive && (isAdminLink ? "text-gold-600 dark:text-gold-400" : "text-primary"))}
                  aria-hidden="true"
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? (isEn ? "Expand sidebar" : "Déplier") : isEn ? "Collapse sidebar" : "Replier"}
          className="hidden h-11 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      <div className={cn("hidden shrink-0 transition-all duration-300 lg:block", isCollapsed ? "w-20" : "w-64")} />

      {isMobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileOpen(false)} aria-hidden="true" />
      )}
    </>
  );
}
