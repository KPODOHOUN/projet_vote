import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import { NotificationType, UserRole } from "@prisma/client";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { env } from "../config/env";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePayinPhone, supportedOperators } from "../common/mobile-operator";

/** Délai entre un changement de numéro de retrait et le premier retrait possible. */
export const PAYOUT_DESTINATION_COOLDOWN_HOURS = 24;

/**
 * Organizer payout (settlement) destination: an encrypted Mobile Money number +
 * network. The raw number is NEVER stored in plaintext nor logged — only an
 * AES-256-GCM ciphertext (packed as iv:authTag:cipher) and the last 4 digits for
 * display. Mirrors the voter-phone privacy rule.
 *
 * Un changement de numéro est journalisé, notifié par email au titulaire du
 * compte, et bloque les retraits pendant 24 h : une session volée ne peut pas
 * rediriger puis vider le solde avant que le titulaire ne réagisse.
 */
const setDestinationSchema = z.object({
  // West-African MoMo numbers: 8–15 digits, optional leading +.
  phone: z.string().regex(/^\+?\d{8,15}$/, "Numéro Mobile Money invalide."),
  network: z.string().trim().min(2).max(20)
});

export type PayoutDestinationSummary = { network: string; last4: string; withdrawalsAvailableAt: string | null };

@Injectable()
export class PayoutDestinationService {
  private readonly logger = new Logger(PayoutDestinationService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Facultatifs : les tests unitaires construisent ce service sans eux.
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly mail?: MailService
  ) {}

  /** Organizer (owner) sets their settlement Mobile Money destination. */
  async setForTenant(user: AuthUser, payload: unknown): Promise<PayoutDestinationSummary> {
    const input = setDestinationSchema.parse(payload);
    const network = input.network.toLowerCase();
    const accepted = supportedOperators();
    if (!accepted.includes(network)) {
      throw new BadRequestException(
        `Réseau Mobile Money non accepté. Réseaux acceptés : ${accepted.map((n) => n.toUpperCase()).join(", ")}.`
      );
    }
    // Même format que les paiements : Bénin en 229 01 + 8 chiffres.
    const normalized = normalizePayinPhone(input.phone);
    const enc = this.encrypt(normalized);
    const last4 = normalized.slice(-4);
    const now = new Date();

    const previous = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: { payoutNetwork: true, payoutPhoneLast4: true }
    });
    await this.prisma.client.$transaction([
      this.prisma.client.tenant.update({
        where: { id: user.tenantId },
        data: { payoutNetwork: network.toUpperCase(), payoutPhoneEnc: enc, payoutPhoneLast4: last4, payoutUpdatedAt: now }
      }),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "payout_destination.changed",
          targetType: "Tenant",
          targetId: user.tenantId,
          metadata: {
            network: network.toUpperCase(),
            last4,
            previousNetwork: previous?.payoutNetwork ?? null,
            previousLast4: previous?.payoutPhoneLast4 ?? null
          }
        }
      })
    ]);

    const availableAt = new Date(now.getTime() + PAYOUT_DESTINATION_COOLDOWN_HOURS * 3_600_000);
    await this.notifications?.create(user.tenantId, NotificationType.PAYOUT_DESTINATION_CHANGED, {
      network: network.toUpperCase(),
      last4,
      withdrawalsAvailableAt: availableAt.toISOString()
    });
    await this.alertOwners(user.tenantId, network.toUpperCase(), last4, availableAt);
    return { network: network.toUpperCase(), last4, withdrawalsAvailableAt: availableAt.toISOString() };
  }

  /** Display-safe summary for the organizer UI: network + last 4 digits only. */
  async getSummaryForTenant(tenantId: string): Promise<PayoutDestinationSummary | null> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { payoutNetwork: true, payoutPhoneEnc: true, payoutPhoneLast4: true, payoutUpdatedAt: true }
    });
    if (!tenant?.payoutNetwork || !tenant.payoutPhoneEnc || !tenant.payoutPhoneLast4) return null;
    const availableAt = cooldownEnd(tenant.payoutUpdatedAt);
    return {
      network: tenant.payoutNetwork,
      last4: tenant.payoutPhoneLast4,
      withdrawalsAvailableAt: availableAt ? availableAt.toISOString() : null
    };
  }

  /**
   * Numéro de retrait actuel, tel qu'il sera figé dans une demande de retrait
   * (chiffré), avec la fin du délai de sécurité s'il court encore.
   */
  async snapshotForTenant(tenantId: string): Promise<{
    destination: { payoutNetwork: string; payoutPhoneEnc: string; payoutPhoneLast4: string };
    withdrawalsAvailableAt: Date | null;
  } | null> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { payoutNetwork: true, payoutPhoneEnc: true, payoutPhoneLast4: true, payoutUpdatedAt: true }
    });
    if (!tenant?.payoutNetwork || !tenant.payoutPhoneEnc || !tenant.payoutPhoneLast4) return null;
    return {
      destination: {
        payoutNetwork: tenant.payoutNetwork,
        payoutPhoneEnc: tenant.payoutPhoneEnc,
        payoutPhoneLast4: tenant.payoutPhoneLast4
      },
      withdrawalsAvailableAt: cooldownEnd(tenant.payoutUpdatedAt)
    };
  }

  /** Numéro en clair, en mémoire uniquement (jamais journalisé ni stocké). */
  revealAccount(payoutPhoneEnc: string): string {
    return this.decrypt(payoutPhoneEnc);
  }

  /** Email au(x) titulaire(s) du compte (best-effort : ne fait jamais échouer le changement). */
  private async alertOwners(tenantId: string, network: string, last4: string, availableAt: Date) {
    if (!this.mail) return;
    try {
      const owners = await this.prisma.client.user.findMany({
        where: { tenantId, role: UserRole.ORGANIZER_OWNER },
        select: { email: true }
      });
      if (owners.length === 0) return;
      const when = availableAt.toLocaleString("fr-FR", { timeZone: "Africa/Porto-Novo" });
      const accountUrl = `${env.APP_PUBLIC_URL.replace(/\/+$/, "")}/dashboard/account#payout-destination`;
      const sent = await this.mail.send({
        to: owners.map((o) => o.email),
        subject: "Votre numéro de retrait SHADOMA a été modifié",
        html: `<p>Bonjour,</p><p>Le numéro Mobile Money de retrait de votre compte vient d'être changé pour un numéro ${network} se terminant par <strong>${last4}</strong>.</p><p>Par sécurité, aucun retrait n'est possible avant le ${when}.</p><p><strong>Ce n'est pas vous ?</strong> Changez immédiatement votre mot de passe, puis remettez votre numéro depuis <a href="${accountUrl}">votre compte</a> et contactez le support.</p>`,
        text: `Le numéro de retrait de votre compte a été changé (${network}, se terminant par ${last4}). Aucun retrait possible avant le ${when}. Ce n'est pas vous ? Changez votre mot de passe et contactez le support : ${accountUrl}`
      });
      if (!sent) this.logger.warn(`Alerte de changement de numéro de retrait non envoyée (tenant ${tenantId}).`);
    } catch (error) {
      this.logger.error(`Alerte de changement de numéro de retrait en échec : ${error instanceof Error ? error.message : String(error)}`);
    }
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

/** Fin du délai de sécurité après un changement de numéro, ou null s'il est écoulé. */
function cooldownEnd(updatedAt: Date | null): Date | null {
  if (!updatedAt) return null;
  const end = new Date(updatedAt.getTime() + PAYOUT_DESTINATION_COOLDOWN_HOURS * 3_600_000);
  return end.getTime() > Date.now() ? end : null;
}
