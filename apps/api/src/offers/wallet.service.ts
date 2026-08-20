import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService["client"];

export type WalletCreditInput = {
  tenantId: string;
  amountCfa: number;
  kind: WalletLedgerKind;
  target: "pending" | "available";
  eventId?: string | null;
  paymentId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

export type WalletDebitInput = {
  tenantId: string;
  amountCfa: number;
  kind: WalletLedgerKind;
  from: "pending" | "available";
  eventId?: string | null;
  paymentId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma.client;
  }

  async getOrCreateWallet(tenantId: string, tx?: Prisma.TransactionClient) {
    const db = this.db(tx);
    const existing = await db.organizerWallet.findUnique({ where: { tenantId } });
    if (existing) return existing;
    try {
      return await db.organizerWallet.create({
        data: { tenantId, availableCfa: 0, pendingCfa: 0 }
      });
    } catch (err) {
      // Concurrent create — re-read.
      const again = await db.organizerWallet.findUnique({ where: { tenantId } });
      if (again) return again;
      throw err;
    }
  }

  async getWallet(tenantId: string) {
    const wallet = await this.getOrCreateWallet(tenantId);
    const recentEntries = await this.prisma.client.walletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return {
      id: wallet.id,
      tenantId: wallet.tenantId,
      availableCfa: wallet.availableCfa,
      pendingCfa: wallet.pendingCfa,
      updatedAt: wallet.updatedAt,
      recentEntries
    };
  }

  /**
   * Credit the wallet and append a ledger entry. Runs in the caller's transaction when provided.
   */
  async credit(input: WalletCreditInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
      throw new BadRequestException("Le montant de crédit doit être un entier positif.");
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      const data =
        input.target === "pending"
          ? { pendingCfa: { increment: input.amountCfa } }
          : { availableCfa: { increment: input.amountCfa } };
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: input.kind,
          amountCfa: input.amountCfa,
          eventId: input.eventId ?? null,
          paymentId: input.paymentId ?? null,
          withdrawalId: input.withdrawalId ?? null,
          note: input.note ?? null
        }
      });
      return { wallet: updated, entry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  /**
   * Debit the wallet (pending or available) and append a ledger entry.
   * amountCfa is stored positive on the ledger; the balance is decremented.
   */
  async debit(input: WalletDebitInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
      throw new BadRequestException("Le montant de débit doit être un entier positif.");
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      if (input.from === "available" && wallet.availableCfa < input.amountCfa) {
        throw new ConflictException(
          `Solde disponible insuffisant (${wallet.availableCfa} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      if (input.from === "pending" && wallet.pendingCfa < input.amountCfa) {
        throw new ConflictException(
          `Solde en attente insuffisant (${wallet.pendingCfa} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      const data =
        input.from === "pending"
          ? { pendingCfa: { decrement: input.amountCfa } }
          : { availableCfa: { decrement: input.amountCfa } };
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: input.kind,
          amountCfa: input.amountCfa,
          eventId: input.eventId ?? null,
          paymentId: input.paymentId ?? null,
          withdrawalId: input.withdrawalId ?? null,
          note: input.note ?? null
        }
      });
      return { wallet: updated, entry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  /**
   * Move funds from pending → available (no net change to total) with optional ledger note.
   * Used at event settlement after retention debit.
   */
  async releasePendingToAvailable(
    args: {
      tenantId: string;
      amountCfa: number;
      eventId?: string | null;
      note?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    if (!Number.isInteger(args.amountCfa) || args.amountCfa <= 0) {
      return null;
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(args.tenantId, db);
      if (wallet.pendingCfa < args.amountCfa) {
        throw new ConflictException(
          `Impossible de libérer ${args.amountCfa} FCFA : solde en attente insuffisant (${wallet.pendingCfa} FCFA).`
        );
      }
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data: {
          pendingCfa: { decrement: args.amountCfa },
          availableCfa: { increment: args.amountCfa }
        }
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: WalletLedgerKind.ADJUSTMENT,
          amountCfa: args.amountCfa,
          eventId: args.eventId ?? null,
          note: args.note ?? "Libération pending → available"
        }
      });
      return { wallet: updated, entry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  async assertWalletExists(tenantId: string) {
    const wallet = await this.prisma.client.organizerWallet.findUnique({ where: { tenantId } });
    if (!wallet) throw new NotFoundException("Portefeuille introuvable.");
    return wallet;
  }
}
