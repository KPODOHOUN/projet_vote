import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";

/**
 * Authentification des appels cron (worker Cloudflare → API).
 *
 * Signature : HMAC-SHA256, clé API_MAINTENANCE_CRON_SECRET, sur
 * `<chemin de la route>\n<corps JSON à clés triées>`. Le chemin fait partie de
 * l'entrée signée : une signature capturée pour une route ne vaut pas pour une
 * autre. `runAtIso` est obligatoire et doit tomber dans la fenêtre
 * API_MAINTENANCE_CRON_MAX_SKEW_SECONDS : une requête capturée n'est rejouable
 * que dans cette fenêtre. Même algorithme côté worker
 * (infra/maintenance-cron-worker/src/index.ts).
 */
export const CRON_SIGNATURE_HEADER = "x-maintenance-cron-signature";

export const CRON_ROUTES = {
  reconcile: "/api/v1/payments/cron/reconcile",
  closeExpired: "/api/v1/offers/cron/close-expired",
  releaseHeld: "/api/v1/offers/cron/release-held",
  purge: "/api/v1/maintenance/cron/purge"
} as const;

export type CronRoute = (typeof CRON_ROUTES)[keyof typeof CRON_ROUTES];

/** JSON canonique (clés triées) : le worker et l'API signent exactement la même chaîne. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function signCronRequest(route: CronRoute, body: unknown, secret: string = env.API_MAINTENANCE_CRON_SECRET): string {
  return createHmac("sha256", secret).update(`${route}\n${stableStringify(body ?? {})}`).digest("hex");
}

/** Vérifie signature et fenêtre de `runAtIso` ; renvoie la date d'exécution annoncée. */
export function assertSignedCronRequest(route: CronRoute, body: unknown, signature: string | undefined): Date {
  if (!signature) throw new BadRequestException("Signature cron manquante.");
  const expected = Buffer.from(signCronRequest(route, body), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new BadRequestException("Signature cron invalide.");
  }
  const runAtIso = (body as { runAtIso?: unknown } | null)?.runAtIso;
  if (typeof runAtIso !== "string" || !runAtIso) throw new BadRequestException("runAtIso requis.");
  const runAt = new Date(runAtIso);
  if (Number.isNaN(runAt.getTime())) throw new BadRequestException("runAtIso invalide.");
  if (Math.abs(Date.now() - runAt.getTime()) > env.API_MAINTENANCE_CRON_MAX_SKEW_SECONDS * 1000) {
    throw new BadRequestException("runAtIso hors fenêtre autorisée.");
  }
  return runAt;
}
