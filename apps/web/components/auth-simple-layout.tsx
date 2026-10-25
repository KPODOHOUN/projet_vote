import type { ReactNode } from "react";
import { AuthMobileBrandHeader } from "./auth-mobile-brand-header";

type AuthSimpleLayoutProps = {
  children: ReactNode;
  contentClassName?: string;
};

/**
 * Pages utilitaires (reset, vérif e-mail, invitation, callback OAuth) : une
 * colonne sur fond neutre, wordmark SHADOMA, carte opaque, sans verre (7.5).
 */
export function AuthSimpleLayout({ children, contentClassName = "max-w-md" }: AuthSimpleLayoutProps) {
  return (
    <div data-zone="secure-flow" className="min-h-screen bg-muted/40 px-4 py-8 sm:px-8 sm:py-16">
      <main className={`mx-auto w-full ${contentClassName}`}>
        <AuthMobileBrandHeader className="mb-8" />
        {children}
      </main>
    </div>
  );
}
