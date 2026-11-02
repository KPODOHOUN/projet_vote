"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "../lib/i18n-provider";

export function LegalFooter() {
  const pathname = usePathname();
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const hideOnAppRoutes =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/vote") ||
    pathname?.startsWith("/accept-invitation") ||
    pathname?.startsWith("/admin") ||
    // Les mini-plateformes ont leur propre pied (PublicEventFooter).
    pathname?.startsWith("/e/");

  if (hideOnAppRoutes) {
    return null;
  }

  const links: Array<{ href: string; label: string }> = [
    { href: "/vote", label: t("footer.access") },
    { href: "/pricing", label: t("footer.pricing") },
    { href: "/legal", label: t("footer.legal") },
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/cookies", label: t("footer.cookies") }
  ];

  return (
    <footer className="border-t border-border bg-background" aria-label={t("footer.label")}>
      <div className="mx-auto w-[min(1160px,100%-2rem)] py-10">
        <Link href="/" className="text-base font-extrabold tracking-tight text-slate-900">
          SHADOMA
        </Link>
        <nav className="mt-4" aria-label={t("footer.label")}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 items-center text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-6 text-xs text-slate-600">© {year} SHADOMA</p>
      </div>
    </footer>
  );
}
