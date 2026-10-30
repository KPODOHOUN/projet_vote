import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventStatus } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import {
  COMMISSION_DEFAULT_BPS_KEY,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_HELD_RELEASE_DELAY_HOURS,
  DEFAULT_OTP_RESEND_DELAY_SECONDS,
  DEFAULT_OTP_TTL_SECONDS,
  DEFAULT_SETTLEMENT_HELD_BPS,
  HELD_RELEASE_DELAY_HOURS_KEY,
  OTP_RESEND_DELAY_SECONDS_KEY,
  OTP_TTL_SECONDS_KEY,
  SETTLEMENT_HELD_BPS_KEY,
  parseIntSetting
} from "../common/platform-settings";
import { PrismaService } from "../prisma/prisma.service";
import { assertCommissionBpsAllowed, COMMISSION_CEILING_BPS, COMMISSION_FLOOR_BPS } from "./commission-guardrails";

/**
 * Règles d'argent de la plateforme — source unique.
 *
 * - La commission SHADOMA est prélevée sur le montant brut de chaque paiement
 *   confirmé (vote, billet, votes ajoutés par l'organisateur). Les frais du
 *   prestataire de paiement sont à la charge de SHADOMA (inclus dans la
 *   commission) : ils ne sont jamais déduits de la part de l'organisateur.
 * - Arrondi : commission = plancher(brut × taux / 10 000), en francs CFA entiers
 *   (aucun calcul en virgule flottante sur les montants).
 * - Le net de l'organisateur est partagé : une part en réserve (heldBps), le
 *   reste disponible au retrait. La réserve est libérée après la clôture du
 *   concours, au délai `heldReleaseDelayHours`.
 * - Taux applicable à un concours : celui figé par son contrat signé, sinon le
 *   taux négocié de l'organisateur en vigueur (CommissionRate), sinon le taux
 *   par défaut (12 %).
 */
export type FinanceSettings = {
  commissionDefaultBps: number;
  heldBps: number;
  heldReleaseDelayHours: number;
  otpTtlSeconds: number;
  otpResendDelaySeconds: number;
};

/** Règles d'argent montrées aux organisateurs (page publique, contrat). */
export type MoneyRules = {
  commissionDefaultBps: number;
  heldBps: number;
  heldReleaseDelayHours: number;
};

const updateSettingsSchema = z.object({
  commissionDefaultBps: z.number().int().min(0).max(10_000).optional(),
  heldBps: z.number().int().min(0).max(10_000).optional(),
  heldReleaseDelayHours: z.number().int().min(0).max(24 * 60).optional(),
  otpTtlSeconds: z.number().int().min(60).max(3600).optional(),
  otpResendDelaySeconds: z.number().int().min(10).max(600).optional()
});

const SETTING_KEYS = [
  COMMISSION_DEFAULT_BPS_KEY,
  SETTLEMENT_HELD_BPS_KEY,
  HELD_RELEASE_DELAY_HOURS_KEY,
  OTP_TTL_SECONDS_KEY,
  OTP_RESEND_DELAY_SECONDS_KEY
] as const;

const KEY_BY_FIELD: Record<keyof z.infer<typeof updateSettingsSchema>, string> = {
  commissionDefaultBps: COMMISSION_DEFAULT_BPS_KEY,
  heldBps: SETTLEMENT_HELD_BPS_KEY,
  heldReleaseDelayHours: HELD_RELEASE_DELAY_HOURS_KEY,
  otpTtlSeconds: OTP_TTL_SECONDS_KEY,
  otpResendDelaySeconds: OTP_RESEND_DELAY_SECONDS_KEY
};

@Injectable()
export class OfferSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<FinanceSettings> {
    const rows = await this.prisma.client.platformSetting.findMany({
      where: { key: { in: [...SETTING_KEYS] } }
    });
    const map = new Map<string, string>(rows.map((r) => [r.key, r.value]));
    return {
      commissionDefaultBps: parseIntSetting(map.get(COMMISSION_DEFAULT_BPS_KEY), DEFAULT_COMMISSION_BPS),
      heldBps: parseIntSetting(map.get(SETTLEMENT_HELD_BPS_KEY), DEFAULT_SETTLEMENT_HELD_BPS),
      heldReleaseDelayHours: parseIntSetting(map.get(HELD_RELEASE_DELAY_HOURS_KEY), DEFAULT_HELD_RELEASE_DELAY_HOURS),
      otpTtlSeconds: parseIntSetting(map.get(OTP_TTL_SECONDS_KEY), DEFAULT_OTP_TTL_SECONDS),
      otpResendDelaySeconds: parseIntSetting(map.get(OTP_RESEND_DELAY_SECONDS_KEY), DEFAULT_OTP_RESEND_DELAY_SECONDS)
    };
  }

  async getMoneyRules(): Promise<MoneyRules> {
    const s = await this.getSettings();
    return {
      commissionDefaultBps: s.commissionDefaultBps,
      heldBps: s.heldBps,
      heldReleaseDelayHours: s.heldReleaseDelayHours
    };
  }

  async updateSettings(user: AuthUser, payload: unknown): Promise<FinanceSettings> {
    const input = updateSettingsSchema.parse(payload);
    const fields = Object.keys(input) as Array<keyof typeof input>;
    if (fields.length === 0) {
      throw new BadRequestException("Aucune modification fournie.");
    }
    if (input.commissionDefaultBps !== undefined) {
      assertCommissionBpsAllowed(user, input.commissionDefaultBps);
    }
    const before = await this.getSettings();
    await this.prisma.client.$transaction([
      ...fields.map((field) =>
        this.prisma.client.platformSetting.upsert({
          where: { key: KEY_BY_FIELD[field] },
          create: { key: KEY_BY_FIELD[field], value: String(input[field]), updatedByUserId: user.userId },
          update: { value: String(input[field]), updatedByUserId: user.userId }
        })
      ),
      this.prisma.client.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "platform.finance_settings_updated",
          targetType: "PlatformSetting",
          targetId: "finance",
          metadata: Object.fromEntries(fields.map((f) => [f, { from: before[f], to: input[f] }]))
        }
      })
    ]);
    return this.getSettings();
  }

  /** Taux négocié de l'organisateur en vigueur à `at`, sinon taux par défaut. */
  async resolveTenantCommissionBps(
    tenantId: string,
    at: Date = new Date()
  ): Promise<{ bps: number; source: "tenant" | "default" }> {
    const rate = await this.prisma.client.commissionRate.findFirst({
      where: { tenantId, effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      select: { bps: true }
    });
    if (rate) return { bps: rate.bps, source: "tenant" };
    return { bps: (await this.getSettings()).commissionDefaultBps, source: "default" };
  }

  /** Taux d'un concours : figé par le contrat (Event.commissionBps), sinon taux de l'organisateur. */
  async resolveCommissionBps(eventId: string): Promise<number> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { commissionBps: true, tenantId: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    if (event.commissionBps != null) return event.commissionBps;
    return (await this.resolveTenantCommissionBps(event.tenantId)).bps;
  }

  /** Part du net mise en réserve pour un concours : figée par le contrat, sinon réglage plateforme. */
  async resolveHeldBps(eventId: string): Promise<number> {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId }, select: { heldBps: true } });
    if (event?.heldBps != null) return event.heldBps;
    return (await this.getSettings()).heldBps;
  }

  /** Commission en francs CFA entiers sur un montant brut (plancher : l'arrondi profite à l'organisateur). */
  computeCommissionCfa(grossCfa: number, bps: number): number {
    if (!Number.isInteger(grossCfa) || grossCfa <= 0 || bps <= 0) return 0;
    return Math.floor((grossCfa * bps) / 10_000);
  }

  /** Vue admin du taux d'un concours : valeur effective, origine, bornes, gel par le contrat. */
  async describeEventCommission(eventId: string): Promise<{
    effectiveBps: number;
    source: "event" | "tenant" | "default";
    eventBps: number | null;
    tenantBps: number | null;
    defaultBps: number;
    floorBps: number;
    ceilingBps: number;
    frozen: boolean;
  }> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { status: true, commissionBps: true, tenantId: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    const settings = await this.getSettings();
    const tenant = await this.resolveTenantCommissionBps(event.tenantId);
    const eventBps = event.commissionBps ?? null;
    return {
      effectiveBps: eventBps ?? tenant.bps,
      source: eventBps != null ? "event" : tenant.source,
      eventBps,
      tenantBps: tenant.source === "tenant" ? tenant.bps : null,
      defaultBps: settings.commissionDefaultBps,
      floorBps: COMMISSION_FLOOR_BPS,
      ceilingBps: COMMISSION_CEILING_BPS,
      // Un concours publié a un contrat signé : son taux ne bouge plus.
      frozen: event.status !== EventStatus.DRAFT
    };
  }
}
