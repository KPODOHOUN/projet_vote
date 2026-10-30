import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { OfferSettingsService } from "./offer-settings.service";

/** Conditions financières de l'organisateur et devis d'ajout de votes. */
@Injectable()
export class OrganizerOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offerSettings: OfferSettingsService
  ) {}

  /** Conditions applicables à l'organisateur connecté : taux en vigueur, réserve, numéro de retrait. */
  async getOffer(user: AuthUser) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: { payoutNetwork: true, payoutPhoneLast4: true, payoutPhoneEnc: true }
    });
    if (!tenant) throw new NotFoundException("Organisation introuvable.");

    const [rules, rate, upcoming] = await Promise.all([
      this.offerSettings.getMoneyRules(),
      this.offerSettings.resolveTenantCommissionBps(user.tenantId),
      this.prisma.client.commissionRate.findFirst({
        where: { tenantId: user.tenantId, effectiveFrom: { gt: new Date() } },
        orderBy: { effectiveFrom: "asc" },
        select: { bps: true, effectiveFrom: true }
      })
    ]);
    return {
      payoutConfigured: Boolean(tenant.payoutPhoneEnc),
      payoutNetwork: tenant.payoutNetwork,
      payoutPhoneLast4: tenant.payoutPhoneLast4,
      commissionBps: rate.bps,
      commissionSource: rate.source,
      upcomingCommission: upcoming ? { bps: upcoming.bps, effectiveFrom: upcoming.effectiveFrom } : null,
      heldBps: rules.heldBps,
      heldReleaseDelayHours: rules.heldReleaseDelayHours
    };
  }

  /**
   * Devis d'ajout de votes par l'organisateur : il paie le prix public des
   * votes ; la commission et la réserve s'appliquent comme pour un vote du
   * public (mêmes règles, même calcul que la confirmation du paiement).
   */
  async topupQuote(user: AuthUser, eventId: string, votesCountRaw: unknown) {
    const votesCount = Number.parseInt(String(votesCountRaw ?? ""), 10);
    if (!Number.isInteger(votesCount) || votesCount <= 0 || votesCount > 1_000_000) {
      throw new BadRequestException("Le nombre de votes doit être un entier positif (1 000 000 au plus).");
    }

    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      select: { id: true, voteUnitPriceCfa: true }
    });
    if (!event) throw new NotFoundException("Événement introuvable.");
    const unitPrice = event.voteUnitPriceCfa;
    if (!unitPrice || unitPrice <= 0) {
      throw new ConflictException("Définissez un prix du vote avant d'ajouter des votes.");
    }

    const grossCfa = votesCount * unitPrice;
    const [commissionBps, heldBps] = await Promise.all([
      this.offerSettings.resolveCommissionBps(event.id),
      this.offerSettings.resolveHeldBps(event.id)
    ]);
    const platformCommissionCfa = this.offerSettings.computeCommissionCfa(grossCfa, commissionBps);
    const netCfa = grossCfa - platformCommissionCfa;
    const heldCfa = Math.floor((netCfa * heldBps) / 10_000);
    return {
      votesCount,
      unitPriceCfa: unitPrice,
      grossCfa,
      amountDueCfa: grossCfa,
      breakdown: {
        description:
          "Vous payez le prix public des votes. Comme pour un vote du public, la commission est prélevée et votre part suit les règles de réserve.",
        commissionBps,
        platformCommissionCfa,
        organizerNetCfa: netCfa,
        heldCfa,
        availableCfa: netCfa - heldCfa
      }
    };
  }

  /** Recettes de la plateforme, par type de paiement (même commission que celle enregistrée au paiement). */
  async adminRevenue() {
    const rows = await this.prisma.client.paymentTransaction.groupBy({
      by: ["purpose"],
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: { in: [PaymentPurpose.VOTE, PaymentPurpose.TICKET, PaymentPurpose.ORGANIZER_VOTE_TOPUP] }
      },
      _sum: { amountCfa: true, commissionCfa: true },
      _count: { _all: true }
    });
    const byPurpose = Object.fromEntries(
      rows.map((r) => [
        r.purpose,
        { grossCfa: r._sum.amountCfa ?? 0, commissionCfa: r._sum.commissionCfa ?? 0, transactions: r._count._all }
      ])
    );
    return {
      byPurpose,
      totalGrossCfa: rows.reduce((s, r) => s + (r._sum.amountCfa ?? 0), 0),
      totalCommissionCfa: rows.reduce((s, r) => s + (r._sum.commissionCfa ?? 0), 0)
    };
  }
}
