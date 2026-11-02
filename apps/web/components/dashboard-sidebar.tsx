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
  Rocket,
  Ticket,
  Wallet
} from "lucide-react";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n-provider";
import { useAuth } from "../lib/auth-context";
import { useOrganizerEvents } from "../lib/hooks/use-organizer-events";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  className?: string;
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isPlatformAdmin } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // « Démarrer » disparaît dès qu'un événement existe (la route reste accessible).
  const eventsQuery = useOrganizerEvents(true);
  const hasEvent = (eventsQuery.data?.length ?? 0) > 0;

  useEffect(() => {
    const handleResize = () => setIsCollapsed(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  const navItems = useMemo(() => {
    // Ordre 7.6 ; la recherche vit dans le header.
    const items: NavItem[] = [
      { href: "/dashboard", label: t("nav.overview"), icon: LayoutDashboard },
      ...(hasEvent ? [] : [{ href: "/dashboard/start", label: t("nav.start"), icon: Rocket }]),
      { href: "/dashboard/events", label: t("nav.events"), icon: Calendar },
      { href: "/dashboard/wallet", label: t("nav.wallet"), icon: Wallet },
      { href: "/dashboard/ticketing", label: t("nav.ticketing"), icon: Ticket },
      { href: "/dashboard/offer", label: t("nav.offer"), icon: CreditCard },
      { href: "/dashboard/team", label: t("nav.team"), icon: UserPlus },
      { href: "/dashboard/notifications", label: t("nav.notifications"), icon: Bell },
      { href: "/dashboard/account", label: t("nav.account"), icon: CircleUser }
    ];
    if (isPlatformAdmin) {
      items.push({
        href: "/admin",
        label: t("nav.platformAdmin"),
        icon: Shield,
        className: "mt-auto border-t border-border pt-4"
      });
    }
    return items;
  }, [t, isPlatformAdmin, hasEvent]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
        aria-expanded={isMobileOpen}
        className="fixed left-4 top-2.5 z-50 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent lg:hidden"
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
          {isCollapsed ? (
            <span className="text-lg font-extrabold tracking-tight text-slate-900" aria-label="SHADOMA">S</span>
          ) : (
            <Link href="/dashboard" className="truncate text-lg font-extrabold tracking-tight text-slate-900">
              SHADOMA
            </Link>
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
                  "group relative flex min-h-11 items-center gap-3 rounded-md px-4 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isActive
                    ? isAdminLink
                      ? "border-l-2 border-gold-600 bg-accent text-gold-700"
                      : "bg-accent font-semibold text-slate-900"
                    : "text-slate-600 hover:bg-accent/60 hover:text-slate-900",
                  item.className
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", isActive && isAdminLink && "text-gold-600")}
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
          aria-label={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          className="hidden h-11 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      <div className={cn("hidden shrink-0 transition-all duration-300 lg:block", isCollapsed ? "w-20" : "w-64")} />

      {isMobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setIsMobileOpen(false)} aria-hidden="true" />
      )}
    </>
  );
}
