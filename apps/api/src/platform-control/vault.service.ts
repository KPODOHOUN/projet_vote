import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";
import { decryptVaultPayload, encryptVaultPayload } from "./vault-crypto";
import { isUniqueConstraintViolation } from "../common/prisma-errors";

export type VaultKind = "vote_cancelled" | "vote_deleted";

export type CreateVaultEntryInput = {
  kind: VaultKind;
  tenantId: string;
  eventId: string;
  originalVoteId: string;
  amountCfa: number;
  occurredAt: Date;
  actorUserId: string | null;
  snapshot: Prisma.InputJsonValue;
};

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
  eventId: z.string().min(1).optional()
});

/**
 * Hidden forensic vault. Writes are side-effects of cancelVote/deleteVote;
 * reads are PLATFORM_SUPER_ADMIN only, behind a fresh-OTP gate (Task 1.7).
 * Snapshot payload is encrypted at rest with API_VAULT_SECRET_KEY (scrypt +
 * AES-256-GCM) — see vault-crypto.ts.
 */
@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  async createEntry(input: CreateVaultEntryInput) {
    const enc = encryptVaultPayload(JSON.stringify(input.snapshot), env.API_VAULT_SECRET_KEY);
    try {
      return await this.prisma.client.vaultEntry.create({
        data: {
          kind: input.kind,
          tenantId: input.tenantId,
          eventId: input.eventId,
          originalVoteId: input.originalVoteId,
          amountCfa: input.amountCfa,
          occurredAt: input.occurredAt,
          actorUserId: input.actorUserId,
          cipherText: enc.cipherText,
          iv: enc.iv,
          authTag: enc.authTag
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("Ce vote est déjà coffré pour ce motif.");
      }
      throw error;
    }
  }

  async listEntries(query: unknown) {
    const q = listSchema.parse(query);
    const items = await this.prisma.client.vaultEntry.findMany({
      where: q.eventId ? { eventId: q.eventId } : {},
      orderBy: { occurredAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        kind: true,
        tenantId: true,
        eventId: true,
        originalVoteId: true,
        amountCfa: true,
        occurredAt: true,
        actorUserId: true,
        createdAt: true
      }
    });
    const hasMore = items.length > q.limit;
    const pageItems = hasMore ? items.slice(0, q.limit) : items;
    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null
    };
  }

  async revealEntry(id: string) {
    const row = await this.prisma.client.vaultEntry.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Entrée du coffre introuvable.");
    }
    const plain = decryptVaultPayload(
      { cipherText: row.cipherText, iv: row.iv, authTag: row.authTag },
      env.API_VAULT_SECRET_KEY
    );
    return {
      id: row.id,
      kind: row.kind,
      occurredAt: row.occurredAt,
      amountCfa: row.amountCfa,
      snapshot: JSON.parse(plain) as Record<string, unknown>
    };
  }

  /**
   * Sum of confiscated revenue across the vault. Used by the platform overview
   * and by the Phase 3 payout calculation (revenue that goes 100% to the
   * platform, never to the organizer).
   */
  async sumConfiscatedAmountCfa(): Promise<number> {
    const agg = await this.prisma.client.vaultEntry.aggregate({
      _sum: { amountCfa: true }
    });
    return agg._sum.amountCfa ?? 0;
  }
}
