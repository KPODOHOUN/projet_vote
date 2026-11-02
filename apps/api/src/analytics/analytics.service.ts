import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";

/** Métadonnées bornées : quelques valeurs simples, jamais un document entier. */
const metadataSchema = z
  .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length <= 20 && JSON.stringify(value).length <= 2_000, "Métadonnées trop volumineuses.");

/**
 * Mesure d'audience (avec consentement). Route publique : l'organisation et
 * l'utilisateur ne sont jamais acceptés depuis le navigateur (n'importe qui
 * pourrait fausser les chiffres d'un organisateur) ; les clés inconnues sont ignorées.
 */
const trackEventSchema = z.object({
  name: z.string().regex(/^[a-z0-9_.:-]{1,80}$/i),
  sessionId: z.string().min(8).max(120),
  metadata: metadataSchema.optional()
});

/** Durée de conservation des mesures d'audience. */
export const PRODUCT_EVENT_RETENTION_DAYS = 90;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(payload: unknown): Promise<{ ok: true }> {
    const input = trackEventSchema.parse(payload);
    await this.prisma.client.productEvent.create({
      data: {
        name: input.name,
        sessionId: input.sessionId,
        userId: null,
        tenantId: null,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
      }
    });
    return { ok: true };
  }
}
