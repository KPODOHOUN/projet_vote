import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  EventStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  TenantOfferType,
  WithdrawalStatus
} from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { OfferSettingsService } from "./offer-settings.service";
import { WalletService } from "./wallet.service";

const switchOfferSchema = z.object({
  offerType: z.nativeEnum(TenantOfferType)
});

const fedapaySubAccountSchema = z.object({
  reference: z.string().trim().regex(/^acc_[A-Za-z0-9_-]+$/, "Référence FedaPay invalide.")
});

@Injectable()
export class OrganizerOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offerSettings: OfferSettingsService,
    private readonly wallet: WalletService
  ) {}

  async getOffer(user: AuthUser) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        offerType: true,
        payoutNetwork: true,
        payoutPhoneLast4: true,
        payoutPhoneEnc: true,
        provider: true,
        fedapaySubAccountRef: true,
        fedapaySubAccountSubmittedAt: true,
        fedapaySubAccountVerifiedAt: true
      }
    });
    if (!tenant) throw new NotFoundException("Organisation introuvable.");

    const settings = await this.offerSettings.getOrganizerSummary();
    return {
      offerType: tenant.offerType,
      payoutConfigured: Boolean(tenant.payoutPhoneEnc),
      payoutNetwork: tenant.payoutNetwork,
      payoutPhoneLast4: tenant.payoutPhoneLast4,
      provider: tenant.provider,
      fedapaySubAccount: {
        reference: tenant.fedapaySubAccountRef,
        submittedAt: tenant.fedapaySubAccountSubmittedAt,
        verifiedAt: tenant.fedapaySubAccountVerifiedAt,
        ready: Boolean(tenant.fedapaySubAccountRef && tenant.fedapaySubAccountVerifiedAt)
      },
      settings
    };
  }

  async submitFedaPaySubAccount(user: AuthUser, payload: unknown) {
    const input = fedapaySubAccountSchema.parse(payload);
    const now = new Date();
    const tenant = await this.prisma.client.tenant.update({
      where: { id: user.tenantId },
      data: {
        provider: PaymentProvider.FEDAPAY,
        fedapaySubAccountRef: input.reference,
        fedapaySubAccountSubmittedAt: now,
        fedapaySubAccountVerifiedAt: null
      },
      select: {
        id: true,
        fedapaySubAccountRef: true,
        fedapaySubAccountSubmittedAt: true
      }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "offer.fedapay_subaccount_submitted",
        targetType: "Tenant",
        targetId: tenant.id,
        metadata: { reference: input.reference }
      }
    });
    return { ...tenant, verifiedAt: null, ready: false };
  }

  async listFedaPaySubAccounts() {
    return this.prisma.client.tenant.findMany({
      where: {
        offerType: TenantOfferType.EXTERNAL,
        fedapaySubAccountRef: { not: null }
      },
      select: {
        id: true,
        slug: true,
        displayName: true,
        fedapaySubAccountRef: true,
        fedapaySubAccountSubmittedAt: true,
        fedapaySubAccountVerifiedAt: true
      },
      orderBy: { fedapaySubAccountSubmittedAt: "desc" }
    });
  }

  async verifyFedaPaySubAccount(admin: AuthUser, tenantId: string) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, fedapaySubAccountRef: true }
    });
    if (!tenant?.fedapaySubAccountRef) {
      throw new NotFoundException("Aucun sous-compte FedaPay soumis pour cette organisation.");
    }
    const verifiedAt = new Date();
    const updated = await this.prisma.client.tenant.update({
      where: { id: tenant.id },
      data: {
        provider: PaymentProvider.FEDAPAY,
        fedapaySubAccountVerifiedAt: verifiedAt
      },
      select: {
        id: true,
        fedapaySubAccountRef: true,
        fedapaySubAccountVerifiedAt: true
      }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: "offer.fedapay_subaccount_verified",
        targetType: "Tenant",
        targetId: tenant.id,
        metadata: { reference: tenant.fedapaySubAccountRef }
      }
    });
    return { ...updated, ready: true };
  }

  async switchOffer(user: AuthUser, payload: unknown) {
    const input = switchOfferSchema.parse(payload);
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, offerType: true }
    });
    if (!tenant) throw new NotFoundException("Organisation introuvable.");
    if (tenant.offerType === input.offerType) {
      return this.getOffer(user);
    }

    const settings = await this.offerSettings.getSettings();
    const activeCount = await this.prisma.client.event.count({
      where: { tenantId: user.tenantId, status: EventStatus.ACTIVE }
    });

    if (tenant.offerType === TenantOfferType.EXTERNAL && input.offerType === TenantOfferType.ESCROW) {
      // 1 → 2
      if (!settings.offer2EscrowEnabled) {
        throw new ConflictException("L'offre Escrow n'est pas activée par la plateforme.");
      }
      if (activeCount > 0) {
        throw new ConflictException(
          "Impossible de passer à l'offre Escrow tant qu'un évènement est actif. Clôturez-les d'abord."
        );
      }
    } else if (
      tenant.offerType === TenantOfferType.ESCROW &&
      input.offerType === TenantOfferType.EXTERNAL
    ) {
      // 2 → 1
      if (!settings.offer1ExternalEnabled) {
        throw new ConflictException("L'offre External n'est pas activée par la plateforme.");
      }
      if (activeCount > 0) {
        throw new ConflictException(
          "Impossible de passer à l'offre External tant qu'un évènement est actif. Clôturez-les d'abord."
        );
      }
      const wallet = await this.wallet.getOrCreateWallet(user.tenantId);
      if (wallet.withdrawableCfa > 0) {
        throw new ConflictException(
          `Solde disponible non nul (${wallet.withdrawableCfa} FCFA). Videz le portefeuille avant de changer d'offre.`
        );
      }
      if (wallet.heldCfa > 0) {
        throw new ConflictException(
          `Solde en attente non nul (${wallet.heldCfa} FCFA). Clôturez les évènements concernés avant de changer d'offre.`
        );
      }
      const pendingWithdrawal = await this.prisma.client.withdrawalRequest.count({
        where: { tenantId: user.tenantId, status: WithdrawalStatus.PENDING }
      });
      if (pendingWithdrawal > 0) {
        throw new ConflictException(
          "Une demande de retrait est en cours. Attendez son traitement avant de changer d'offre."
        );
      }
    } else {
      throw new BadRequestException("Type d'offre invalide.");
    }

    await this.prisma.client.tenant.update({
      where: { id: user.tenantId },
      data: { offerType: input.offerType }
    });
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorRole: user.role,
        action: "offer.switched",
        targetType: "Tenant",
        targetId: user.tenantId,
        metadata: { from: tenant.offerType, to: input.offerType }
      }
    });

    return this.getOffer(user);
  }

  async topupQuote(user: AuthUser, eventId: string, votesCountRaw: unknown) {
    const votesCount = Number.parseInt(String(votesCountRaw ?? ""), 10);
    if (!Number.isInteger(votesCount) || votesCount <= 0 || votesCount > 1_000_000) {
      throw new BadRequestException("votesCount doit être un entier positif (max 1 000 000).");
    }

    const event = await this.prisma.client.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId },
      select: {
        id: true,
        voteUnitPriceCfa: true,
        status: true,
        tenant: { select: { offerType: true } }
      }
    });
    if (!event) throw new NotFoundException("Évènement introuvable.");
    const unitPrice = event.voteUnitPriceCfa;
    if (!unitPrice || unitPrice <= 0) {
      throw new ConflictException(
        "Définissez un prix unitaire de vote sur l'évènement avant d'ajouter des votes."
      );
    }

    const grossCfa = votesCount * unitPrice;
    const settings = await this.offerSettings.getSettings();
    const offerType = event.tenant.offerType;

    if (offerType === TenantOfferType.EXTERNAL) {
      const amountDueCfa = this.offerSettings.computeExternalCommissionCfa(settings, grossCfa);
      return {
        votesCount,
        unitPriceCfa: unitPrice,
        grossCfa,
        amountDueCfa,
        offerType,
        breakdown: {
          description:
            "Offre External : vous ne payez que la commission plateforme sur le montant des votes ajoutés.",
          commissionBps: settings.offer1CommissionBps,
          commissionFixedCfa: settings.offer1CommissionFixedCfa,
          platformCommissionCfa: amountDueCfa
        }
      };
    }

    // ESCROW: full amount. La commission affichée doit être celle qui sera
    // réellement prélevée par payment-verify (event override → tenant override
    // → taux plateforme), sinon le devis diverge du débit dès qu'un admin pose
    // une surcharge.
    const escrowCommissionBps = await this.offerSettings.resolveEscrowCommissionBps(event.id);
    return {
      votesCount,
      unitPriceCfa: unitPrice,
      grossCfa,
      amountDueCfa: grossCfa,
      offerType,
      breakdown: {
        description:
          "Offre Escrow : le montant total (votes × prix) est encaissé puis crédité sur votre portefeuille.",
        platformCommissionCfa: this.offerSettings.computeEscrowVoteCommissionCfaFromBps(
          grossCfa,
          escrowCommissionBps
        )
      }
    };
  }

  async adminRevenueByOfferType() {
    const rows = await this.prisma.client.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        purpose: { in: [PaymentPurpose.VOTE, PaymentPurpose.ORGANIZER_VOTE_TOPUP] },
        commissionCfa: { not: null }
      },
      select: {
        commissionCfa: true,
        amountCfa: true,
        purpose: true,
        tenant: { select: { offerType: true } }
      }
    });

    const byOffer: Record<
      TenantOfferType,
      { commissionCfa: number; grossCfa: number; transactions: number }
    > = {
      [TenantOfferType.EXTERNAL]: { commissionCfa: 0, grossCfa: 0, transactions: 0 },
      [TenantOfferType.ESCROW]: { commissionCfa: 0, grossCfa: 0, transactions: 0 }
    };

    for (const r of rows) {
      const bucket = byOffer[r.tenant.offerType];
      bucket.commissionCfa += r.commissionCfa ?? 0;
      bucket.grossCfa += r.amountCfa;
      bucket.transactions += 1;
    }

    return {
      byOfferType: byOffer,
      totalCommissionCfa:
        byOffer.EXTERNAL.commissionCfa + byOffer.ESCROW.commissionCfa
    };
  }
}
