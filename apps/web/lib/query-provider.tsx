"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Provider TanStack React Query — gestion centralisée du cache API,
 * déduplication des requêtes, stale-while-revalidate, et états
 * loading/error/empty standardisés.
 *
 * À wrapper autour du layout principal (apps/web/app/layout.tsx).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        /** 30 s avant qu'une requête soit considérée "stale" */
                        staleTime: 30_000,
                        /** Temps en cache avant garbage collection */
                        gcTime: 5 * 60_000,
                        /** 1 tentative de retry en cas d'échec */
                        retry: 1,
                        /** Pas de refetch automatique au focus de la fenêtre */
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

