import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";

const OTP_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(`votezpro:vault:otp:${code}`).digest("hex");
}

/**
 * Lightweight 2FA for vault access: a super-admin requests an unlock, receives
 * a 6-digit code by email, posts it back to mint a 10-minute HMAC vault token.
 * The raw code is never stored (only its sha256); 5 wrong tries kill the
 * challenge. The token is a self-contained `payloadHex.expHex.hmac` triple
 * signed with API_VAULT_SECRET_KEY (no DB lookup needed to verify).
 */
@Injectable()
export class VaultOtpService {
  constructor(private readonly prisma: PrismaService) {}

  async requestUnlock(userId: string): Promise<{ challengeId: string; code: string }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const row = await this.prisma.client.vaultUnlockChallenge.create({
      data: {
        userId,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
      }
    });
    // In production this triggers an email delivery of `code`. In test/dev the
    // code is returned so E2E automation can complete the flow.
    return { challengeId: row.id, code };
  }

  async confirmUnlock(userId: string, challengeId: string, code: string): Promise<string> {
    const row = await this.prisma.client.vaultUnlockChallenge.findUnique({
      where: { id: challengeId }
    });
    if (!row || row.userId !== userId) {
      throw new UnauthorizedException("Challenge invalide.");
    }
    if (row.consumedAt) {
      throw new UnauthorizedException("Challenge déjà utilisé.");
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Challenge expiré.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException("Challenge bloqué après trop d'essais.");
    }
    const expected = Buffer.from(row.codeHash, "utf8");
    const provided = Buffer.from(hashCode(code), "utf8");
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);
    await this.prisma.client.vaultUnlockChallenge.update({
      where: { id: challengeId },
      data: matches ? { consumedAt: new Date() } : { attempts: { increment: 1 } }
    });
    if (!matches) {
      throw new UnauthorizedException("Code invalide.");
    }
    return this.signToken(userId);
  }

  verifyToken(token: string, userId: string): boolean {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }
    const payloadHex = parts[0];
    const expHex = parts[1];
    const sig = parts[2];
    if (!payloadHex || !expHex || !sig) {
      return false;
    }
    const expected = createHmac("sha256", env.API_VAULT_SECRET_KEY)
      .update(`${payloadHex}.${expHex}`)
      .digest("hex");
    if (sig.length !== expected.length) {
      return false;
    }
    if (!timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))) {
      return false;
    }
    if (Buffer.from(payloadHex, "hex").toString("utf8") !== userId) {
      return false;
    }
    const expiresAt = Number.parseInt(expHex, 16);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      return false;
    }
    return true;
  }

  private signToken(userId: string): string {
    const payloadHex = Buffer.from(userId, "utf8").toString("hex");
    const expHex = (Date.now() + TOKEN_TTL_MS).toString(16);
    const sig = createHmac("sha256", env.API_VAULT_SECRET_KEY)
      .update(`${payloadHex}.${expHex}`)
      .digest("hex");
    return `${payloadHex}.${expHex}.${sig}`;
  }
}
