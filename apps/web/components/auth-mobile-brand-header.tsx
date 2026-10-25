import Link from "next/link";

type AuthMobileBrandHeaderProps = {
  className?: string;
};

/** Wordmark texte (décision D7 : aucun fichier de logo SHADOMA fourni). */
export function AuthMobileBrandHeader({ className = "" }: AuthMobileBrandHeaderProps) {
  return (
    <div className={className}>
      <Link href="/" className="inline-flex min-h-11 items-center text-lg font-extrabold tracking-tight text-slate-900">
        SHADOMA
      </Link>
    </div>
  );
}
