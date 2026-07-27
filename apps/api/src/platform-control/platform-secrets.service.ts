import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { FEEXPAY_API_SECRET_KEY } from "../common/payment-secrets";
import {
  ACTIVATION_FEE_CFA_KEY,
  COMMISSION_BPS_KEY,
  DEFAULT_ACTIVATION_FEE_CFA,
  FEEXPAY_SHOP_ID_KEY,
  parseIntSetting
} from "../common/platform-settings";
import { env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

const saveFeexpaySchema = z.object({
  apiKey: z.string().min(16).max(4096),
  shopId: z.string().min(1).max(120).optional()
});

@Injectable()
export class PlatformSecretsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPaymentSetupStatus() {
    const dbKey = await this.resolveSecret(FEEXPAY_API_SECRET_KEY);
    const shopSetting = await this.prisma.client.platformSetting.findUnique({
      where: { key: FEEXPAY_SHOP_ID_KEY }
    });
    const shopId = shopSetting?.value ?? env.FEEXPAY_SHOP_ID;
    const apiKeySource = dbKey ? ("database" as const) : this.isEnvFeexpayConfigured() ? ("env" as const) : ("none" as const);
    const effectiveApiKey = dbKey ?? (this.isEnvFeexpayConfigured() ? env.FEEXPAY_API_KEY : null);
    return {
      feexpayConfigured: Boolean(effectiveApiKey),
      shopIdConfigured: shopId.length > 0 && !shopId.includes("dev-shop"),
      apiKeySource,
      shopIdSource: shopSetting ? ("database" as const) : ("env" as const),
      activationUsesPlatformAccount: true,
      key: FEEXPAY_API_SECRET_KEY
    } as const;
  }

  async saveFeexpayCredentials(user: AuthUser, payload: unknown) {
    const input = saveFeexpaySchema.parse(payload);
    const encrypted = encryptSecret(input.apiKey);
    await this.prisma.client.platformSecret.upsert({
      where: { key: FEEXPAY_API_SECRET_KEY },
      create: {
        key: FEEXPAY_API_SECRET_KEY,
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedByUserId: user.userId
      },
      update: {
        cipherText: encrypted.cipherText,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedByUserId: user.userId
      }
    });
    if (input.shopId) {
      await this.prisma.client.platformSetting.upsert({
        where: { key: FEEXPAY_SHOP_ID_KEY },
        create: { key: FEEXPAY_SHOP_ID_KEY, value: input.shopId, updatedByUserId: user.userId },
        update: { value: input.shopId, updatedByUserId: user.userId }
      });
    }
    return this.getPaymentSetupStatus();
  }

  async resolvePlatformFeexpayCredentials(): Promise<{ apiKey: string; shop: string }> {
    const apiKey = (await this.resolveSecret(FEEXPAY_API_SECRET_KEY)) ?? env.FEEXPAY_API_KEY;
    const shopSetting = await this.prisma.client.platformSetting.findUnique({
      where: { key: FEEXPAY_SHOP_ID_KEY }
    });
    const shop = shopSetting?.value ?? env.FEEXPAY_SHOP_ID;
    return { apiKey, shop };
  }

  async getPlatformSettings() {
    const rows = await this.prisma.client.platformSetting.findMany({
      where: { key: { in: [COMMISSION_BPS_KEY, ACTIVATION_FEE_CFA_KEY, FEEXPAY_SHOP_ID_KEY] } }
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const paymentSetup = await this.getPaymentSetupStatus();
    return {
      commissionBps: parseIntSetting(map.get(COMMISSION_BPS_KEY), 0),
      activationFeeCfa: parseIntSetting(map.get(ACTIVATION_FEE_CFA_KEY), DEFAULT_ACTIVATION_FEE_CFA),
      feexpayShopId: map.get(FEEXPAY_SHOP_ID_KEY) ?? env.FEEXPAY_SHOP_ID,
      paymentSetup
    };
  }

  private async resolveSecret(key: string): Promise<string | null> {
    const secret = await this.prisma.client.platformSecret.findUnique({ where: { key } });
    if (!secret) return null;
    return decryptSecret({
      cipherText: secret.cipherText,
      iv: secret.iv,
      authTag: secret.authTag
    });
  }

  private isEnvFeexpayConfigured(): boolean {
    const key = env.FEEXPAY_API_KEY;
    return key.length >= 16 && !key.includes("change_me");
  }
}

function cipherKey(): Buffer {
  return scryptSync(env.API_ORGANIZER_SECRET_KEY, "platform-secret-v1", 32);
}

function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return {
    cipherText: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptSecret(payload: { cipherText: string; iv: string; authTag: string }): string {
  const decipher = createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "base64")),
    decipher.final()
  ]).toString("utf8");
}
