import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import {
  DEFAULT_OTP_RESEND_DELAY_SECONDS,
  DEFAULT_OTP_TTL_SECONDS,
  DEFAULT_SETTLEMENT_HELD_BPS,
  OFFER1_COMMISSION_BPS_KEY,
  OFFER1_COMMISSION_FIXED_CFA_KEY,
  OFFER1_ENABLED_KEY,
  OFFER2_ENABLED_KEY,
  OFFER2_PER_VOTE_COMMISSION_BPS_KEY,
  OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY,
  OFFER2_RETENTION_BPS_KEY,
  OTP_RESEND_DELAY_SECONDS_KEY,
  OTP_TTL_SECONDS_KEY,
  PSP_FEDAPAY_SUPPORTS_SPLIT_KEY,
  PSP_FEEXPAY_SUPPORTS_SPLIT_KEY,
  PSP_KKIAPAY_SUPPORTS_SPLIT_KEY,
  SETTLEMENT_HELD_BPS_KEY,
  parseBoolSetting,
  parseIntSetting
} from "../common/platform-settings";
import { PrismaService } from "../prisma/prisma.service";

/** Offre 1 External reste en réflexion — désactivée par défaut pendant la phase de test. */
export const DEFAULT_OFFER1_ENABLED = false;
export const DEFAULT_OFFER2_ENABLED = true;
export const DEFAULT_OFFER1_COMMISSION_BPS = 1000; // 10%
export const DEFAULT_OFFER1_COMMISSION_FIXED_CFA = 0;
export const DEFAULT_OFFER2_RETENTION_BPS = 500; // 5%
export const DEFAULT_OFFER2_PER_VOTE_COMMISSION_ENABLED = false;
export const DEFAULT_OFFER2_PER_VOTE_COMMISSION_BPS = 0;

export type OfferSettings = {
  offer1ExternalEnabled: boolean;
  offer2EscrowEnabled: boolean;
  offer1CommissionBps: number;
  offer1CommissionFixedCfa: number;
  offer2RetentionBps: number;
  offer2PerVoteCommissionEnabled: boolean;
  offer2PerVoteCommissionBps: number;
  pspFeexpaySupportsSplit: boolean;
  pspFedapaySupportsSplit: boolean;
  pspKkiapaySupportsSplit: boolean;
  otpTtlSeconds: number;
  otpResendDelaySeconds: number;
};

const updateOfferSettingsSchema = z.object({
  offer1ExternalEnabled: z.boolean().optional(),
  offer2EscrowEnabled: z.boolean().optional(),
  offer1CommissionBps: z.number().int().min(0).max(10_000).optional(),
  offer1CommissionFixedCfa: z.number().int().min(0).max(10_000_000).optional(),
  offer2RetentionBps: z.number().int().min(0).max(10_000).optional(),
  offer2PerVoteCommissionEnabled: z.boolean().optional(),
  offer2PerVoteCommissionBps: z.number().int().min(0).max(10_000).optional(),
  pspFeexpaySupportsSplit: z.boolean().optional(),
  pspFedapaySupportsSplit: z.boolean().optional(),
  pspKkiapaySupportsSplit: z.boolean().optional(),
  otpTtlSeconds: z.number().int().min(60).max(3600).optional(),
  otpResendDelaySeconds: z.number().int().min(10).max(600).optional()
});

const OFFER_SETTING_KEYS = [
  OFFER1_ENABLED_KEY,
  OFFER2_ENABLED_KEY,
  OFFER1_COMMISSION_BPS_KEY,
  OFFER1_COMMISSION_FIXED_CFA_KEY,
  OFFER2_RETENTION_BPS_KEY,
  OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY,
  OFFER2_PER_VOTE_COMMISSION_BPS_KEY,
  PSP_FEEXPAY_SUPPORTS_SPLIT_KEY,
  PSP_FEDAPAY_SUPPORTS_SPLIT_KEY,
  PSP_KKIAPAY_SUPPORTS_SPLIT_KEY,
  OTP_TTL_SECONDS_KEY,
  OTP_RESEND_DELAY_SECONDS_KEY
] as const;

@Injectable()
export class OfferSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<OfferSettings> {
    const rows = await this.prisma.client.platformSetting.findMany({
      where: { key: { in: [...OFFER_SETTING_KEYS] } }
    });
    const map = new Map<string, string>(rows.map((r) => [r.key, r.value]));
    return {
      offer1ExternalEnabled: parseBoolSetting(map.get(OFFER1_ENABLED_KEY), DEFAULT_OFFER1_ENABLED),
      offer2EscrowEnabled: parseBoolSetting(map.get(OFFER2_ENABLED_KEY), DEFAULT_OFFER2_ENABLED),
      offer1CommissionBps: parseIntSetting(
        map.get(OFFER1_COMMISSION_BPS_KEY),
        DEFAULT_OFFER1_COMMISSION_BPS
      ),
      offer1CommissionFixedCfa: parseIntSetting(
        map.get(OFFER1_COMMISSION_FIXED_CFA_KEY),
        DEFAULT_OFFER1_COMMISSION_FIXED_CFA
      ),
      offer2RetentionBps: parseIntSetting(
        map.get(OFFER2_RETENTION_BPS_KEY),
        DEFAULT_OFFER2_RETENTION_BPS
      ),
      offer2PerVoteCommissionEnabled: parseBoolSetting(
        map.get(OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY),
        DEFAULT_OFFER2_PER_VOTE_COMMISSION_ENABLED
      ),
      offer2PerVoteCommissionBps: parseIntSetting(
        map.get(OFFER2_PER_VOTE_COMMISSION_BPS_KEY),
        DEFAULT_OFFER2_PER_VOTE_COMMISSION_BPS
      ),
      pspFeexpaySupportsSplit: parseBoolSetting(map.get(PSP_FEEXPAY_SUPPORTS_SPLIT_KEY), false),
      pspFedapaySupportsSplit: parseBoolSetting(map.get(PSP_FEDAPAY_SUPPORTS_SPLIT_KEY), true),
      pspKkiapaySupportsSplit: parseBoolSetting(map.get(PSP_KKIAPAY_SUPPORTS_SPLIT_KEY), false),
      otpTtlSeconds: parseIntSetting(map.get(OTP_TTL_SECONDS_KEY), DEFAULT_OTP_TTL_SECONDS),
      otpResendDelaySeconds: parseIntSetting(
        map.get(OTP_RESEND_DELAY_SECONDS_KEY),
        DEFAULT_OTP_RESEND_DELAY_SECONDS
      )
    };
  }

  /** Public summary for organizers (no admin-only PSP ops flags beyond split relevance). */
  async getOrganizerSummary(): Promise<{
    offer1ExternalEnabled: boolean;
    offer2EscrowEnabled: boolean;
    offer1CommissionBps: number;
    offer1CommissionFixedCfa: number;
    offer2RetentionBps: number;
    offer2PerVoteCommissionEnabled: boolean;
    offer2PerVoteCommissionBps: number;
  }> {
    const s = await this.getSettings();
    return {
      offer1ExternalEnabled: s.offer1ExternalEnabled,
      offer2EscrowEnabled: s.offer2EscrowEnabled,
      offer1CommissionBps: s.offer1CommissionBps,
      offer1CommissionFixedCfa: s.offer1CommissionFixedCfa,
      offer2RetentionBps: s.offer2RetentionBps,
      offer2PerVoteCommissionEnabled: s.offer2PerVoteCommissionEnabled,
      offer2PerVoteCommissionBps: s.offer2PerVoteCommissionBps
    };
  }

  async updateSettings(user: AuthUser, payload: unknown): Promise<OfferSettings> {
    const input = updateOfferSettingsSchema.parse(payload);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException("Aucune modification fournie.");
    }
    if (input.pspFeexpaySupportsSplit === true || input.pspKkiapaySupportsSplit === true) {
      throw new BadRequestException(
        "Seul FedaPay Marketplace dispose actuellement d'un split natif validé."
      );
    }

    const pairs: Array<{ key: string; value: string }> = [];
    if (input.offer1ExternalEnabled !== undefined) {
      pairs.push({ key: OFFER1_ENABLED_KEY, value: String(input.offer1ExternalEnabled) });
    }
    if (input.offer2EscrowEnabled !== undefined) {
      pairs.push({ key: OFFER2_ENABLED_KEY, value: String(input.offer2EscrowEnabled) });
    }
    if (input.offer1CommissionBps !== undefined) {
      pairs.push({ key: OFFER1_COMMISSION_BPS_KEY, value: String(input.offer1CommissionBps) });
    }
    if (input.offer1CommissionFixedCfa !== undefined) {
      pairs.push({
        key: OFFER1_COMMISSION_FIXED_CFA_KEY,
        value: String(input.offer1CommissionFixedCfa)
      });
    }
    if (input.offer2RetentionBps !== undefined) {
      pairs.push({ key: OFFER2_RETENTION_BPS_KEY, value: String(input.offer2RetentionBps) });
    }
    if (input.offer2PerVoteCommissionEnabled !== undefined) {
      pairs.push({
        key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY,
        value: String(input.offer2PerVoteCommissionEnabled)
      });
    }
    if (input.offer2PerVoteCommissionBps !== undefined) {
      pairs.push({
        key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY,
        value: String(input.offer2PerVoteCommissionBps)
      });
    }
    if (input.pspFeexpaySupportsSplit !== undefined) {
      pairs.push({
        key: PSP_FEEXPAY_SUPPORTS_SPLIT_KEY,
        value: String(input.pspFeexpaySupportsSplit)
      });
    }
    if (input.pspFedapaySupportsSplit !== undefined) {
      pairs.push({
        key: PSP_FEDAPAY_SUPPORTS_SPLIT_KEY,
        value: String(input.pspFedapaySupportsSplit)
      });
    }
    if (input.pspKkiapaySupportsSplit !== undefined) {
      pairs.push({
        key: PSP_KKIAPAY_SUPPORTS_SPLIT_KEY,
        value: String(input.pspKkiapaySupportsSplit)
      });
    }
    if (input.otpTtlSeconds !== undefined) {
      pairs.push({ key: OTP_TTL_SECONDS_KEY, value: String(input.otpTtlSeconds) });
    }
    if (input.otpResendDelaySeconds !== undefined) {
      pairs.push({
        key: OTP_RESEND_DELAY_SECONDS_KEY,
        value: String(input.otpResendDelaySeconds)
      });
    }

    await this.prisma.client.$transaction(
      pairs.map((p) =>
        this.prisma.client.platformSetting.upsert({
          where: { key: p.key },
          create: { key: p.key, value: p.value, updatedByUserId: user.userId },
          update: { value: p.value, updatedByUserId: user.userId }
        })
      )
    );

    return this.getSettings();
  }

  /** Platform commission on a gross amount for Offer 1 (EXTERNAL). */
  computeExternalCommissionCfa(
    settings: OfferSettings,
    grossCfa: number
  ): number {
    const pct = Math.floor((grossCfa * settings.offer1CommissionBps) / 10_000);
    return Math.max(0, pct + settings.offer1CommissionFixedCfa);
  }

  /** Optional per-vote commission for Offer 2 (ESCROW). */
  computeEscrowVoteCommissionCfa(settings: OfferSettings, amountCfa: number): number {
    if (!settings.offer2PerVoteCommissionEnabled) return 0;
    if (settings.offer2PerVoteCommissionBps <= 0) return 0;
    return Math.floor((amountCfa * settings.offer2PerVoteCommissionBps) / 10_000);
  }

  /**
   * Résolution de la commission par vote pour l'offre Escrow : event override
   * → tenant override → taux plateforme par défaut. Ne fait AUCUNE distinction
   * Tier Standard/Pro (pas encore modélisé) — voir ADR-020 pour la portée F2.
   */
  async resolveEscrowCommissionBps(eventId: string): Promise<number> {
    const settings = await this.getSettings();
    if (!settings.offer2PerVoteCommissionEnabled) return 0;
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { commissionBps: true, tenant: { select: { commissionBps: true } } }
    });
    if (event?.commissionBps != null) return event.commissionBps;
    if (event?.tenant.commissionBps != null) return event.tenant.commissionBps;
    return settings.offer2PerVoteCommissionBps;
  }

  /** Commission calculée à partir d'un taux déjà résolu (pas du taux plat des settings). */
  computeEscrowVoteCommissionCfaFromBps(amountCfa: number, bps: number): number {
    if (bps <= 0) return 0;
    return Math.floor((amountCfa * bps) / 10_000);
  }

  /** Taux held plateforme par défaut, en attendant F5 (palier de confiance). */
  async getDefaultHeldBps(): Promise<number> {
    const setting = await this.prisma.client.platformSetting.findUnique({
      where: { key: SETTLEMENT_HELD_BPS_KEY }
    });
    return parseIntSetting(setting?.value, DEFAULT_SETTLEMENT_HELD_BPS);
  }
}
