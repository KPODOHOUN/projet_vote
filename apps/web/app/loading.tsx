export default function Loading() {
    return (
        <main className="flex min-h-[70dvh] items-center justify-center px-6" aria-label="Chargement de SHADOMA Votes">
            <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-xl font-black text-white shadow-lg shadow-brand-500/25">
                    SV
                </div>
                <div className="space-y-1">
                    <p className="font-semibold text-foreground">SHADOMA Votes</p>
                    <p className="text-sm text-muted-foreground">Chargement de la plateforme…</p>
                </div>
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
            </div>
        </main>
    );
}