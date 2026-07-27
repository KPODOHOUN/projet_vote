import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { paymentSecretKeys } from "../common/payment-secrets";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

const saveSecretSchema = z.object({
  key: z.string().min(2).max(80),
  value: z.string().min(1).max(4096)
});

@Injectable()
export class OrganizerSecretsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveSecret(user: AuthUser, payload: unknown) {
    const input = saveSecretSchema.parse(payload);
    const encrypted = this.encrypt(input.value);
    const secret = await this.prisma.client.tenantSecret.upsert({
      where: {
        tenantId_key: {
          tenantId: user.tenantId,
          key: input.key
        }
      },
      update: {
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        createdByUserId: user.userId
      },
      create: {
        tenantId: user.tenantId,
        key: input.key,
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        createdByUserId: user.userId
      }
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "tenant_secret.upserted",
        targetType: "TenantSecret",
        targetId: secret.id,
        metadata: { key: input.key }
      }
    });

    return { key: secret.key, updatedAt: secret.updatedAt.toISOString() };
  }

  async getSecret(user: AuthUser, key: string) {
    const secret = await this.prisma.client.tenantSecret.findUnique({
      where: {
        tenantId_key: {
          tenantId: user.tenantId,
          key
        }
      }
    });
    if (!secret) {
      throw new NotFoundException("Secret introuvable.");
    }

    const encryptedPayload = {
      cipherText: secret.cipherText,
      iv: secret.iv,
      authTag: secret.authTag
    };

    // Try the current (scrypt) key first. If it fails, try the legacy
    // (padded) key to transparently support secrets encrypted before the
    // key-derivation upgrade. When fallback succeeds, re-encrypt with
    // the new key so subsequent reads no longer need the fallback.
    let plainText: string;
    try {
      plainText = decryptWithKey(encryptedPayload, createCipherKeyScrypt(env.API_ORGANIZER_SECRET_KEY));
    } catch {
      plainText = decryptWithKey(encryptedPayload, createCipherKeyLegacy(env.API_ORGANIZER_SECRET_KEY));

      // Re-encrypt with the new key derivation (transparent migration)
      const reEncrypted = this.encrypt(plainText);
      await this.prisma.client.tenantSecret.update({
        where: { id: secret.id },
        data: {
          cipherText: reEncrypted.cipherText,
          iv: reEncrypted.iv,
          authTag: reEncrypted.authTag
        }
      });
      await this.prisma.client.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "tenant_secret.key_derivation_migrated",
          targetType: "TenantSecret",
          targetId: secret.id,
          metadata: { key, migratedAt: new Date().toISOString() }
        }
      });
    }

    return { key, value: plainText };
  }

  async getSecretStatus(user: AuthUser, key: string) {
    const secret = await this.prisma.client.tenantSecret.findUnique({
      where: { tenantId_key: { tenantId: user.tenantId, key } }
    });
    return {
      key,
      configured: Boolean(secret),
      maskedValue: secret ? "••••••••" : null
    } as const;
  }

  async getEventSecretStatus(user: AuthUser, eventId: string, key: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const secret = await this.prisma.client.eventSecret.findUnique({
      where: { eventId_key: { eventId, key } }
    });
    return {
      eventId,
      key,
      configured: Boolean(secret),
      maskedValue: secret ? "••••••••" : null
    } as const;
  }

  async getPaymentSetupStatus(user: AuthUser, eventId?: string) {
    // Résolution du provider (même chaîne que PspRegistry.resolveProvider),
    // lue en direct pour ne pas créer de dépendance de module circulaire
    // (payments importe déjà organizer-secrets).
    let provider: PaymentProvider | null = null;
    let event: { id: string } | null = null;
    if (eventId) {
      const ev = await this.prisma.client.event.findFirst({
        where: { id: eventId, tenantId: user.tenantId },
        select: { id: true, provider: true, tenant: { select: { provider: true } } }
      });
      if (ev) {
        event = { id: ev.id };
        provider = ev.provider ?? ev.tenant.provider ?? null;
      }
    }
    if (!provider) {
      const tenant = await this.prisma.client.tenant.findUnique({
        where: { id: user.tenantId },
        select: { provider: true }
      });
      provider = tenant?.provider ?? (env.DEFAULT_PSP_PROVIDER as PaymentProvider);
    }

    // Clés pertinentes pour ce provider (FeexPay/FedaPay = 1 clé ; KkiaPay = 3).
    // L'organisateur/évènement est « configuré » seulement si TOUTES sont présentes.
    const keys = paymentSecretKeys(provider);

    const organizerConfigured =
      keys.length > 0 &&
      (
        await Promise.all(
          keys.map((k) =>
            this.prisma.client.tenantSecret.findUnique({
              where: { tenantId_key: { tenantId: user.tenantId, key: k } }
            })
          )
        )
      ).every(Boolean);

    let eventSecretConfigured = false;
    if (event) {
      const eventSecrets = await Promise.all(
        keys.map((k) =>
          this.prisma.client.eventSecret.findUnique({
            where: { eventId_key: { eventId: event.id, key: k } }
          })
        )
      );
      eventSecretConfigured = keys.length > 0 && eventSecrets.every(Boolean);
    }

    const platformFallback = this.isPlatformFeexpayConfigured();

    return {
      provider,
      key: keys[0] ?? null,
      organizerConfigured,
      eventConfigured: eventSecretConfigured,
      platformFallback,
      /** Votants : clé orga/concours requise en prod ; repli plateforme = dev. */
      readyForVotes: organizerConfigured || eventSecretConfigured || platformFallback,
      /** Forfait d'activation : toujours encaissé sur le compte plateforme. */
      activationUsesPlatformAccount: true,
      platformReadyForActivation: platformFallback,
      effectiveSource: eventSecretConfigured
        ? ("event" as const)
        : organizerConfigured
          ? ("organizer" as const)
          : platformFallback
            ? ("platform" as const)
            : ("none" as const)
    } as const;
  }

  private isPlatformFeexpayConfigured(): boolean {
    const key = env.FEEXPAY_API_KEY;
    return key.length >= 16 && !key.includes("change_me");
  }

  // --- Per-event secrets (ADR-016 Phase 2: an event can have its own FeexPay
  // account). Stored encrypted in EventSecret, resolved event-first at payment.

  async saveEventSecret(user: AuthUser, eventId: string, payload: unknown) {
    const input = saveSecretSchema.parse(payload);
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const encrypted = this.encrypt(input.value);
    const secret = await this.prisma.client.eventSecret.upsert({
      where: { eventId_key: { eventId, key: input.key } },
      update: {
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        createdByUserId: user.userId
      },
      create: {
        eventId,
        key: input.key,
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        createdByUserId: user.userId
      }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "event_secret.upserted",
        targetType: "EventSecret",
        targetId: secret.id,
        metadata: { eventId, key: input.key }
      }
    });
    return { eventId, key: secret.key, updatedAt: secret.updatedAt.toISOString() };
  }

  async getEventSecret(user: AuthUser, eventId: string, key: string) {
    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    });
    if (!event) {
      throw new NotFoundException("Évènement introuvable.");
    }
    const secret = await this.prisma.client.eventSecret.findUnique({
      where: { eventId_key: { eventId, key } }
    });
    if (!secret) {
      throw new NotFoundException("Secret introuvable.");
    }
    const value = decryptWithKey(
      { cipherText: secret.cipherText, iv: secret.iv, authTag: secret.authTag },
      createCipherKeyScrypt(env.API_ORGANIZER_SECRET_KEY)
    );
    return { eventId, key, value };
  }

  /**
   * Resolve a payment-related secret for an event: the event's own secret if
   * present, otherwise the organizer's tenant secret. Returns null if neither.
   * Used to route payments to a per-event FeexPay account (with org fallback).
   */
  async resolvePaymentSecret(eventId: string, tenantId: string, key: string): Promise<string | null> {
    const scryptKey = createCipherKeyScrypt(env.API_ORGANIZER_SECRET_KEY);
    const eventSecret = await this.prisma.client.eventSecret.findUnique({
      where: { eventId_key: { eventId, key } }
    });
    if (eventSecret) {
      return decryptWithKey(
        { cipherText: eventSecret.cipherText, iv: eventSecret.iv, authTag: eventSecret.authTag },
        scryptKey
      );
    }
    const tenantSecret = await this.prisma.client.tenantSecret.findUnique({
      where: { tenantId_key: { tenantId, key } }
    });
    if (tenantSecret) {
      return decryptWithKey(
        { cipherText: tenantSecret.cipherText, iv: tenantSecret.iv, authTag: tenantSecret.authTag },
        scryptKey
      );
    }
    return null;
  }

  /**
   * Migrate all tenant secrets from legacy key derivation to scrypt.
   * Called from the maintenance controller for batch migration.
   * Returns the count of migrated secrets.
   */
  async migrateAllSecrets(actorUser: AuthUser): Promise<{ migrated: number; skipped: number; failed: string[] }> {
    const allSecrets = await this.prisma.client.tenantSecret.findMany({});
    let migrated = 0;
    let skipped = 0;
    const failed: string[] = [];

    const scryptKey = createCipherKeyScrypt(env.API_ORGANIZER_SECRET_KEY);
    const legacyKey = createCipherKeyLegacy(env.API_ORGANIZER_SECRET_KEY);

    for (const secret of allSecrets) {
      const encryptedPayload = {
        cipherText: secret.cipherText,
        iv: secret.iv,
        authTag: secret.authTag
      };

      // Try decrypting with the new key — if it works, already migrated
      try {
        decryptWithKey(encryptedPayload, scryptKey);
        skipped += 1;
        continue;
      } catch {
        // Needs migration
      }

      // Try decrypting with the legacy key
      try {
        const plainText = decryptWithKey(encryptedPayload, legacyKey);
        const reEncrypted = encryptWithKey(plainText, scryptKey);
        await this.prisma.client.tenantSecret.update({
          where: { id: secret.id },
          data: {
            cipherText: reEncrypted.cipherText,
            iv: reEncrypted.iv,
            authTag: reEncrypted.authTag
          }
        });
        migrated += 1;
      } catch {
        failed.push(`${secret.tenantId}:${secret.key}`);
      }
    }

    await this.prisma.client.auditLog.create({
      data: {
        tenantId: actorUser.tenantId,
        actorUserId: actorUser.userId,
        actorRole: actorUser.role,
        action: "tenant_secret.batch_key_migration",
        targetType: "TenantSecret",
        metadata: { migrated, skipped, failedCount: failed.length }
      }
    });

    return { migrated, skipped, failed };
  }

  private encrypt(plainText: string) {
    return encryptWithKey(plainText, createCipherKeyScrypt(env.API_ORGANIZER_SECRET_KEY));
  }
}

// ---------------------------------------------------------------------------
// Key derivation functions
// ---------------------------------------------------------------------------

/**
 * Current key derivation: scrypt with a deterministic salt.
 * Produces a cryptographically strong 32-byte AES key.
 */
function createCipherKeyScrypt(rawSecret: string) {
  const salt = createHash("sha256").update(`votezpro:aes-key-salt:${rawSecret}`).digest();
  return scryptSync(rawSecret, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Legacy key derivation: simple UTF-8 padding.
 * Kept ONLY for backward-compatible decryption during migration.
 * @deprecated Use createCipherKeyScrypt for all new encryption.
 */
function createCipherKeyLegacy(rawSecret: string) {
  if (rawSecret.length === 32) {
    return Buffer.from(rawSecret, "utf8");
  }
  return Buffer.from(rawSecret.padEnd(32, "0").slice(0, 32), "utf8");
}

// ---------------------------------------------------------------------------
// Low-level encrypt / decrypt helpers
// ---------------------------------------------------------------------------

function encryptWithKey(plainText: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64")
  };
}

function decryptWithKey(
  payload: { cipherText: string; iv: string; authTag: string },
  key: Buffer
) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plainText = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "base64")),
    decipher.final()
  ]);
  return plainText.toString("utf8");
}
