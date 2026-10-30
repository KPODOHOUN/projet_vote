"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { LanguageSwitcher, useI18n } from "../lib/i18n-provider";
import { roleLabel } from "../lib/admin-labels";
import { displayName, initials } from "../lib/user-display";
import { cn } from "../lib/utils";

type UserMenuProps = {
  /** Page « réglages / mon compte » propre à l'espace (admin ou organisateur). */
  settingsHref: string;
  settingsLabel: string;
  onLogout: () => void | Promise<void>;
};

/**
 * Menu profil de l'en-tête : avatar + nom ; au clic, réglages, langue et
 * déconnexion regroupés. Échap ou clic dehors ferment et rendent le focus.
 */
export function UserMenu({ settingsHref, settingsLabel, onLogout }: UserMenuProps) {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const isEn = locale === "en";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = displayName(user);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={isEn ? `Account menu — ${name}` : `Menu du compte — ${name}`}
        className="flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-10"
      >
        {user.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar distant, taille fixe
          <img src={user.photoUrl} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {initials(name)}
          </span>
        )}
        <span className="hidden max-w-[10rem] truncate md:inline">{name}</span>
        <ChevronDown className={cn("hidden size-4 text-muted-foreground transition-transform md:block", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={isEn ? "Account" : "Compte"}
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs font-medium text-slate-600">{roleLabel(user.role, isEn)}</p>
          </div>
          <div className="p-1">
            <Link
              href={settingsHref}
              role="menuitem"
              className="flex h-10 items-center gap-2 rounded-md px-3 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
              {settingsLabel}
            </Link>
            <div className="flex h-10 items-center justify-between gap-2 px-3 text-sm">
              <span className="text-muted-foreground">{isEn ? "Language" : "Langue"}</span>
              <LanguageSwitcher />
            </div>
          </div>
          <div className="border-t border-border p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
              className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {t("nav.logout")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
