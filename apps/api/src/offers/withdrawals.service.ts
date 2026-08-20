import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { WalletLedgerKind, WithdrawalStatus } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "../auth/auth.types";
import { env } from "../config/env";
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
    private readonly wallet: WalletService
  ) {}

  async requestWithdrawal(user: AuthUser, payload: unknown) {
    const input = requestWithdrawalSchema.parse(payload);
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: { offerType: true, payoutPhoneEnc: true }
    });
    if (!tenant) throw new NotFoundException("Organisation introuvable.");
    if (tenant.offerType !== "ESCROW") {
      throw new ConflictException(
        "Les retraits portefeuille sont réservés à l'offre Escrow (Offre 2)."
      );
    }
    if (!tenant.payoutPhoneEnc) {
      throw new ConflictException(
        "Configurez d'abord votre destination de paiement (numéro Mobile Money) avant de demander un retrait."
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const wallet = await this.wallet.getOrCreateWallet(user.tenantId, tx);
      if (wallet.availableCfa < input.amountCfa) {
        throw new ConflictException(
          `Montant supérieur au solde disponible (${wallet.availableCfa} FCFA).`
        );
      }

      const request = await tx.withdrawalRequest.create({
        data: {
          tenantId: user.tenantId,
          amountCfa: input.amountCfa,
          status: WithdrawalStatus.PENDING
        }
      });

      await this.wallet.debit(
        {
          tenantId: user.tenantId,
          amountCfa: input.amountCfa,
          kind: WalletLedgerKind.WITHDRAWAL_DEBIT,
          from: "available",
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
      include: {
        tenant: { select: { id: true, slug: true, displayName: true, offerType: true } }
      }
    });
  }

  async approve(admin: AuthUser, id: string) {
    return this.transition(admin, id, WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED, {
      action: "withdrawal.approved"
    });
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

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: WithdrawalStatus.REJECTED,
          rejectReason: input.reason,
          processedByUserId: admin.userId,
          processedAt: new Date()
        }
      });

      // Restore available balance.
      await this.wallet.credit(
        {
          tenantId: existing.tenantId,
          amountCfa: existing.amountCfa,
          kind: WalletLedgerKind.ADJUSTMENT,
          target: "available",
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
  }

  async markPaid(admin: AuthUser, id: string) {
    return this.transition(admin, id, WithdrawalStatus.APPROVED, WithdrawalStatus.PAID, {
      action: env.API_PAYMENT_DEMO_MODE ? "withdrawal.marked_paid_demo" : "withdrawal.marked_paid",
      demoMode: env.API_PAYMENT_DEMO_MODE
    });
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

    const updated = await this.prisma.client.withdrawalRequest.update({
      where: { id },
      data: {
        status: to,
        processedByUserId: admin.userId,
        processedAt: new Date()
      }
    });

    await this.prisma.client.auditLog.create({
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
  }
}
