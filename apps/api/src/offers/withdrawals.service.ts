import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { NotificationType, WalletLedgerKind, WithdrawalStatus } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { env } from "../config/env";
import { NotificationsService } from "../notifications/notifications.service";
import { PAYOUT_DESTINATION_COOLDOWN_HOURS, PayoutDestinationService } from "../payouts/payout-destination.service";
import { PrismaService } from "../prisma/prisma.service";
import { WalletService } from "./wallet.service";

const requestWithdrawalSchema = z.object({
  amountCfa: z.number().int().positive().max(100_000_000)
});

const rejectSchema = z.object({
  reason: z.string().min(3).max(500)
});

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly destinations: PayoutDestinationService
  ) {}

  async requestWithdrawal(user: AuthUser, payload: unknown) {
    const input = requestWithdrawalSchema.parse(payload);
    const snapshot = await this.destinations.snapshotForTenant(user.tenantId);
    if (!snapshot) {
      throw new ConflictException("Enregistrez d'abord votre numéro Mobile Money de retrait.");
    }
    if (snapshot.withdrawalsAvailableAt) {
      const when = snapshot.withdrawalsAvailableAt.toLocaleString("fr-FR", { timeZone: "Africa/Porto-Novo" });
      throw new ConflictException(
        `Votre numéro de retrait a été modifié il y a moins de ${PAYOUT_DESTINATION_COOLDOWN_HOURS} h : par sécurité, retrait possible à partir du ${when}.`
      );
    }
    const destination = snapshot.destination;

    return this.prisma.client.$transaction(async (tx) => {
      const wallet = await this.wallet.getOrCreateWallet(user.tenantId, tx);
      if (wallet.withdrawableCfa < input.amountCfa) {
        throw new ConflictException(
          `Montant supérieur au solde disponible (${wallet.withdrawableCfa} FCFA).`
        );
      }

      const request = await tx.withdrawalRequest.create({
        data: {
          tenantId: user.tenantId,
          amountCfa: input.amountCfa,
          status: WithdrawalStatus.PENDING,
          ...destination
        }
      });

      await this.wallet.debit(
        {
          tenantId: user.tenantId,
          amountCfa: input.amountCfa,
          kind: WalletLedgerKind.WITHDRAWAL_DEBIT,
          from: "withdrawable",
          withdrawalId: request.id,
          note: "Demande de retrait"
        },
        tx
      );

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          actorRole: user.role,
          action: "withdrawal.requested",
          targetType: "WithdrawalRequest",
          targetId: request.id,
          metadata: { amountCfa: input.amountCfa }
        }
      });

      return request;
    });
  }

  async listForOrganizer(tenantId: string) {
    return this.prisma.client.withdrawalRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" }
    });
  }

  async listAll(query: Record<string, unknown>) {
    const statusRaw = typeof query.status === "string" ? query.status : undefined;
    const status =
      statusRaw && Object.values(WithdrawalStatus).includes(statusRaw as WithdrawalStatus)
        ? (statusRaw as WithdrawalStatus)
        : undefined;
    return this.prisma.client.withdrawalRequest.findMany({
      ...(status ? { where: { status } } : {}),
      orderBy: { createdAt: "desc" },
      take: 200,
      // Jamais le numéro chiffré : réseau + 4 derniers chiffres seulement.
      select: {
        id: true,
        tenantId: true,
        amountCfa: true,
        status: true,
        rejectReason: true,
        payoutNetwork: true,
        payoutPhoneLast4: true,
        processedAt: true,
        createdAt: true,
        tenant: { select: { id: true, slug: true, displayName: true } }
      }
    });
  }

  /**
   * Numéro complet à créditer pour un retrait accepté. Seul un administrateur y
   * accède, et chaque consultation est journalisée.
   */
  async revealDestination(admin: AuthUser, id: string) {
    const request = await this.prisma.client.withdrawalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Demande de retrait introuvable.");
    if (request.status !== WithdrawalStatus.APPROVED) {
      throw new ConflictException("Le numéro n'est visible que pour un retrait accepté, à payer.");
    }
    if (!request.payoutPhoneEnc || !request.payoutNetwork) {
      throw new ConflictException("Cette ancienne demande n'a pas de numéro enregistré : contactez l'organisateur.");
    }
    await this.prisma.client.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: "withdrawal.destination_revealed",
        targetType: "WithdrawalRequest",
        targetId: request.id
      }
    });
    return {
      network: request.payoutNetwork,
      phone: this.destinations.revealAccount(request.payoutPhoneEnc),
      amountCfa: request.amountCfa
    };
  }

  async approve(admin: AuthUser, id: string) {
    return this.notify(NotificationType.WITHDRAWAL_APPROVED, await this.transition(admin, id, WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED, {
      action: "withdrawal.approved"
    }));
  }

  async reject(admin: AuthUser, id: string, payload: unknown) {
    const input = rejectSchema.parse(payload);
    const existing = await this.prisma.client.withdrawalRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Demande de retrait introuvable.");
    if (existing.status !== WithdrawalStatus.PENDING) {
      throw new ConflictException(
        `Impossible de rejeter un retrait au statut ${existing.status}.`
      );
    }

    const rejected = await this.prisma.client.$transaction(async (tx) => {
      // Atomic claim: only one concurrent reject/approve can move the request
      // out of PENDING. Without it two rejects both restored the amount.
      const claim = await tx.withdrawalRequest.updateMany({
        where: { id, status: WithdrawalStatus.PENDING },
        data: {
          status: WithdrawalStatus.REJECTED,
          rejectReason: input.reason,
          processedByUserId: admin.userId,
          processedAt: new Date()
        }
      });
      if (claim.count === 0) {
        throw new ConflictException("Ce retrait a déjà été traité.");
      }
      const updated = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id } });

      // Restore available balance.
      await this.wallet.credit(
        {
          tenantId: existing.tenantId,
          amountCfa: existing.amountCfa,
          kind: WalletLedgerKind.ADJUSTMENT,
          target: "withdrawable",
          withdrawalId: existing.id,
          note: `Rejet retrait: ${input.reason}`
        },
        tx
      );

      await tx.auditLog.create({
        data: {
          tenantId: existing.tenantId,
          actorUserId: admin.userId,
          actorRole: admin.role,
          action: "withdrawal.rejected",
          targetType: "WithdrawalRequest",
          targetId: id,
          metadata: { reason: input.reason, amountCfa: existing.amountCfa }
        }
      });

      return updated;
    });
    return this.notify(NotificationType.WITHDRAWAL_REJECTED, rejected);
  }

  async markPaid(admin: AuthUser, id: string) {
    return this.notify(NotificationType.WITHDRAWAL_PAID, await this.transition(admin, id, WithdrawalStatus.APPROVED, WithdrawalStatus.PAID, {
      action: env.API_PAYMENT_DEMO_MODE ? "withdrawal.marked_paid_demo" : "withdrawal.marked_paid",
      demoMode: env.API_PAYMENT_DEMO_MODE
    }));
  }

  /** Prévient l'organisateur du changement de statut de son retrait. */
  private async notify<T extends { id: string; tenantId: string; amountCfa: number }>(type: NotificationType, request: T): Promise<T> {
    await this.notifications.create(request.tenantId, type, { withdrawalId: request.id, amountCfa: request.amountCfa });
    return request;
  }

  private async transition(
    admin: AuthUser,
    id: string,
    from: WithdrawalStatus,
    to: WithdrawalStatus,
    meta: { action: string; demoMode?: boolean }
  ) {
    const existing = await this.prisma.client.withdrawalRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Demande de retrait introuvable.");
    if (existing.status !== from) {
      throw new ConflictException(
        `Transition invalide : statut actuel ${existing.status}, attendu ${from}.`
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const claim = await tx.withdrawalRequest.updateMany({
        where: { id, status: from },
        data: {
          status: to,
          processedByUserId: admin.userId,
          processedAt: new Date()
        }
      });
      if (claim.count === 0) {
        throw new ConflictException("Ce retrait a déjà été traité.");
      }
      const updated = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id } });

      await tx.auditLog.create({
        data: {
          tenantId: existing.tenantId,
          actorUserId: admin.userId,
          actorRole: admin.role,
          action: meta.action,
          targetType: "WithdrawalRequest",
          targetId: id,
          metadata: {
            from,
            to,
            amountCfa: existing.amountCfa,
            ...(meta.demoMode ? { paymentDemoMode: true } : {})
          }
        }
      });

      return updated;
    });
  }
}
