import { BadRequestException, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { z } from "zod";
import { PaymentProvider } from "@prisma/client";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Organizer payout (settlement) destination: an encrypted Mobile Money number +
 * network. The raw number is NEVER stored in plaintext nor logged — only an
 * AES-256-GCM ciphertext (packed as iv:authTag:cipher) and the last 4 digits for
 * display. Mirrors the voter-phone privacy rule.
 */
const setDestinationSchema = z.object({
  // West-African MoMo numbers: 8–15 digits, optional leading +.
  phone: z.string().regex(/^\+?\d{8,15}$/, "Numéro Mobile Money invalide."),
  network: z.string().min(2).max(20) // "MTN" | "MOOV" | "MTN_CI" | ...
});

export type OrganizerPayoutDestination = {
  network: string;
  account: string; // decrypted MoMo number — in-memory only, never persisted/logged
};

@Injectable()
export class PayoutDestinationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Organizer (or owner) sets their settlement Mobile Money destination. */
  async setForTenant(tenantId: string, payload: unknown): Promise<{ network: string; last4: string }> {
    const input = setDestinationSchema.parse(payload);
    const normalized = input.phone.replace(/^\+/, "");
    const enc = this.encrypt(normalized);
    const last4 = normalized.slice(-4);
    await this.prisma.client.tenant.update({
      where: { id: tenantId },
      data: { payoutNetwork: input.network, payoutPhoneEnc: enc, payoutPhoneLast4: last4 }
    });
    return { network: input.network, last4 };
  }

  /**
   * Resolve a tenant's decrypted payout destination. Returns null when the
   * organizer has not configured one — the orchestrator must then SKIP (never
   * disburse to an unknown account).
   */
  async resolveForTenant(tenantId: string): Promise<OrganizerPayoutDestination | null> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { payoutNetwork: true, payoutPhoneEnc: true }
    });
    if (!tenant?.payoutNetwork || !tenant.payoutPhoneEnc) return null;
    return { network: tenant.payoutNetwork, account: this.decrypt(tenant.payoutPhoneEnc) };
  }

  /** Platform settlement destination from env (Flow A master account). */
  platformDestination(): { provider: PaymentProvider; network: string; account: string } {
    return {
      provider: env.DEFAULT_PSP_PROVIDER as PaymentProvider,
      network: env.PLATFORM_PAYOUT_NETWORK,
      account: env.PLATFORM_PAYOUT_ACCOUNT
    };
  }

  private key(): Buffer {
    return scryptSync(env.API_ORGANIZER_SECRET_KEY, "votezpro-payout-dest", 32);
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const cipherText = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${cipherText.toString("base64")}`;
  }

  private decrypt(packed: string): string {
    const parts = packed.split(":");
    if (parts.length !== 3) throw new BadRequestException("Destination de versement corrompue.");
    const [ivB64, tagB64, dataB64] = parts as [string, string, string];
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  }
}
