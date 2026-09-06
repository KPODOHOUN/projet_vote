import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, WalletLedgerEntry, WalletLedgerKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService["client"];

export type WalletCreditInput = {
  tenantId: string;
  amountCfa: number;
  kind: WalletLedgerKind;
  target: "held" | "withdrawable";
  eventId?: string | null;
  paymentId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

export type WalletDebitInput = {
  tenantId: string;
  amountCfa: number;
  kind: WalletLedgerKind;
  from: "held" | "withdrawable";
  eventId?: string | null;
  paymentId?: string | null;
  withdrawalId?: string | null;
  note?: string | null;
};

export type WalletSplitCreditInput = {
  tenantId: string;
  netCfa: number;
  heldBps: number;
  kind: WalletLedgerKind;
  eventId?: string | null;
  paymentId?: string | null;
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
        data: { tenantId, withdrawableCfa: 0, heldCfa: 0 }
      });
    } catch (err) {
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
      withdrawableCfa: wallet.withdrawableCfa,
      heldCfa: wallet.heldCfa,
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
        input.target === "held"
          ? { heldCfa: { increment: input.amountCfa } }
          : { withdrawableCfa: { increment: input.amountCfa } };
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
   * Split a net vote/topup amount between held (reserve) and withdrawable,
   * per the vote-time formula (business plan §4): held = floor(net * heldBps / 10_000).
   * Writes one ledger entry per non-zero side (HELD_ALLOCATION-tagged calls
   * pass kind=HELD_ALLOCATION for the held portion; the withdrawable portion
   * keeps the caller's kind, e.g. VOTE_CREDIT).
   */
  async creditSplit(input: WalletSplitCreditInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.netCfa) || input.netCfa <= 0) {
      throw new BadRequestException("Le montant net doit être un entier positif.");
    }
    if (!Number.isInteger(input.heldBps) || input.heldBps < 0 || input.heldBps > 10_000) {
      throw new BadRequestException("heldBps doit être un entier entre 0 et 10000.");
    }
    const heldCfa = Math.floor((input.netCfa * input.heldBps) / 10_000);
    const withdrawableCfa = input.netCfa - heldCfa;

    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data: {
          heldCfa: { increment: heldCfa },
          withdrawableCfa: { increment: withdrawableCfa }
        }
      });

      let heldEntry: WalletLedgerEntry | null = null;
      if (heldCfa > 0) {
        heldEntry = await db.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            kind: WalletLedgerKind.HELD_ALLOCATION,
            amountCfa: heldCfa,
            eventId: input.eventId ?? null,
            paymentId: input.paymentId ?? null,
            note: input.note ? `${input.note} (réserve)` : "Réserve de sécurité"
          }
        });
      }

      let withdrawableEntry: WalletLedgerEntry | null = null;
      if (withdrawableCfa > 0) {
        withdrawableEntry = await db.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            kind: input.kind,
            amountCfa: withdrawableCfa,
            eventId: input.eventId ?? null,
            paymentId: input.paymentId ?? null,
            note: input.note ?? null
          }
        });
      }

      return { wallet: updated, heldEntry, withdrawableEntry };
    };
    if (tx) return run(tx);
    return this.prisma.client.$transaction((inner) => run(inner));
  }

  /**
   * Debit the wallet (held or withdrawable) and append a ledger entry.
   * amountCfa is stored positive on the ledger; the balance is decremented.
   */
  async debit(input: WalletDebitInput, tx?: Prisma.TransactionClient) {
    if (!Number.isInteger(input.amountCfa) || input.amountCfa <= 0) {
      throw new BadRequestException("Le montant de débit doit être un entier positif.");
    }
    const run = async (db: Prisma.TransactionClient) => {
      const wallet = await this.getOrCreateWallet(input.tenantId, db);
      if (input.from === "withdrawable" && wallet.withdrawableCfa < input.amountCfa) {
        throw new ConflictException(
          `Solde disponible insuffisant (${wallet.withdrawableCfa} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      if (input.from === "held" && wallet.heldCfa < input.amountCfa) {
        throw new ConflictException(
          `Solde en réserve insuffisant (${wallet.heldCfa} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      const data =
        input.from === "held"
          ? { heldCfa: { decrement: input.amountCfa } }
          : { withdrawableCfa: { decrement: input.amountCfa } };
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
   * Move funds from held → withdrawable (no net change to total) with optional ledger note.
   * Used 48h after event closure (see EventSettlementService.releaseMaturedHeld).
   */
  async releaseHeldToWithdrawable(
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
      if (wallet.heldCfa < args.amountCfa) {
        throw new ConflictException(
          `Impossible de libérer ${args.amountCfa} FCFA : solde en réserve insuffisant (${wallet.heldCfa} FCFA).`
        );
      }
      const updated = await db.organizerWallet.update({
        where: { id: wallet.id },
        data: {
          heldCfa: { decrement: args.amountCfa },
          withdrawableCfa: { increment: args.amountCfa }
        }
      });
      const entry = await db.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          kind: WalletLedgerKind.HELD_RELEASE,
          amountCfa: args.amountCfa,
          eventId: args.eventId ?? null,
          note: args.note ?? "Libération held → withdrawable"
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
