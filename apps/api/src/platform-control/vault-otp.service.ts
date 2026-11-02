import { Injectable, Logger, Optional, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";
import { MailService } from "../mail/mail.service";

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
  private readonly logger = new Logger(VaultOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Optionnel : les tests construisent ce service sans e-mail.
    @Optional() private readonly mail?: MailService
  ) {}

  /**
   * Le code part par e-mail au super-admin : la réponse HTTP ne le contient
   * jamais (sinon une session volée suffirait à ouvrir le coffre). Seule
   * exception : développement ou tests sans service d'e-mail, comme les autres codes.
   */
  async requestUnlock(userId: string): Promise<{ challengeId: string; expiresAt: string; code?: string }> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new UnauthorizedException("Compte introuvable.");
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const row = await this.prisma.client.vaultUnlockChallenge.create({
      data: {
        userId,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
      }
    });
    const sent = this.mail
      ? await this.mail.send({
          to: [user.email],
          subject: "Code d'accès au coffre SHADOMA",
          html: `<p>Votre code d'accès au coffre : <strong style="font-size:20px;letter-spacing:2px">${code}</strong></p><p>Il expire dans 5 minutes. Si vous n'êtes pas à l'origine de cette demande, changez votre mot de passe immédiatement.</p>`
        })
      : false;
    if (!sent && env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("Envoi du code impossible : le service d'e-mail n'est pas configuré.");
    }
    if (!sent) this.logger.warn(`[vault:dev] code d'accès au coffre pour ${user.email} : ${code}`);
    return { challengeId: row.id, expiresAt: row.expiresAt.toISOString(), ...(sent ? {} : { code }) };
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
    // Essai réservé atomiquement AVANT la comparaison : des envois en parallèle
    // ne comparent jamais plus de MAX_ATTEMPTS codes.
    const claimed = await this.prisma.client.vaultUnlockChallenge.updateMany({
      where: { id: challengeId, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } }
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException("Challenge bloqué après trop d'essais.");
    }
    const expected = Buffer.from(row.codeHash, "utf8");
    const provided = Buffer.from(hashCode(code), "utf8");
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);
    if (!matches) {
      throw new UnauthorizedException("Code invalide.");
    }
    const consumed = await this.prisma.client.vaultUnlockChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() }
    });
    if (consumed.count === 0) {
      throw new UnauthorizedException("Challenge déjà utilisé.");
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
