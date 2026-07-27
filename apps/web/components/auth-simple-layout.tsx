import type { ReactNode } from "react";
import { AmbientBackdrop } from "./ambient-backdrop";
import { AuthMobileBrandHeader } from "./auth-mobile-brand-header";

type AuthSimpleLayoutProps = {
  children: ReactNode;
  contentClassName?: string;
};

/** Formulaire centré sans panneau image — pages utilitaires (reset, vérif e-mail, etc.). */
export function AuthSimpleLayout({ children, contentClassName = "max-w-md" }: AuthSimpleLayoutProps) {
  return (
    <AmbientBackdrop className="flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-8">
      <main className="flex w-full flex-col items-center">
        <AuthMobileBrandHeader className={`mb-8 w-full ${contentClassName}`} />
        <div className={`w-full ${contentClassName}`}>{children}</div>
      </main>
    </AmbientBackdrop>
  );
}
