import type { ReactNode } from "react";
import { AuthMobileBrandHeader } from "./auth-mobile-brand-header";

type AuthSplitLayoutProps = {
  asideClassName: string;
  marketing: ReactNode;
  children: ReactNode;
  contentClassName?: string;
};

/**
 * Split auth/marketing layout: full marketing panel from md+, form-first on mobile.
 */
export function AuthSplitLayout({
  asideClassName,
  marketing,
  children,
  contentClassName = "max-w-md"
}: AuthSplitLayoutProps) {
  return (
    <main className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className={`hidden flex-col justify-center md:flex ${asideClassName}`}>{marketing}</aside>

      <section className="flex flex-1 flex-col items-center justify-center px-4 py-6 pb-28 sm:px-8 md:px-12 md:py-12 md:pb-12 lg:px-16 lg:py-16">
        <AuthMobileBrandHeader className={`mb-6 w-full md:hidden ${contentClassName}`} />
        <div className={`w-full ${contentClassName}`}>{children}</div>
      </section>
    </main>
  );
}
