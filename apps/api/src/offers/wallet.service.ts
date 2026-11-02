import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { LedgerBucket, LedgerDirection, Prisma, WalletLedgerEntry, WalletLedgerKind } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { appendLedgerEntry, bucketOf } from "./ledger-entry";

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
    // INSERT … ON CONFLICT DO NOTHING : deux premiers crédits simultanés ne
    // lèvent pas d'erreur (un échec de contrainte annulerait la transaction
    // Postgres de l'appelant, sans reprise possible).
    await db.$executeRaw`
      INSERT INTO "OrganizerWallet" ("id", "tenantId", "withdrawableCfa", "heldCfa", "createdAt", "updatedAt")
      VALUES (${`wal_${randomUUID()}`}, ${tenantId}, 0, 0, NOW(), NOW())
      ON CONFLICT ("tenantId") DO NOTHING`;
    return db.organizerWallet.findUniqueOrThrow({ where: { tenantId } });
  }

  async getWallet(tenantId: string) {
    const wallet = await this.getOrCreateWallet(tenantId);
    const recentEntries = await this.prisma.client.walletLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const breakdown = await this.ledgerBreakdown(wallet.id, wallet.tenantId);
    return {
      id: wallet.id,
      tenantId: wallet.tenantId,
      withdrawableCfa: wallet.withdrawableCfa,
      heldCfa: wallet.heldCfa,
      updatedAt: wallet.updatedAt,
      recentEntries,
      // Ajouts additifs (Lot E5), calculés ici et jamais dans le navigateur.
      ...breakdown
    };
  }

  /**
   * Commission prélevée et détail par événement, depuis le journal signé
   * (ADR-021). Seuls les paiements réellement crédités à ce wallet comptent ;
   * les lignes sans sens (antérieures à ADR-021) sont comptées à part.
   */
  private async ledgerBreakdown(walletId: string, tenantId: string) {
    const entries = await this.prisma.client.walletLedgerEntry.findMany({
      where: { walletId },
      select: { eventId: true, paymentId: true, kind: true, direction: true, bucket: true, amountCfa: true }
    });

    type EventLine = { heldCfa: number; creditedAvailableCfa: number };
    const perEvent = new Map<string, EventLine>();
    const paymentIds = new Set<string>();
    let ledgerUnknownEntries = 0;
    for (const e of entries) {
      if (e.paymentId) paymentIds.add(e.paymentId);
      if (e.direction === null || e.bucket === null) {
        ledgerUnknownEntries += 1;
        continue;
      }
      if (!e.eventId) continue;
      const line = perEvent.get(e.eventId) ?? { heldCfa: 0, creditedAvailableCfa: 0 };
      const signed = e.direction === LedgerDirection.CREDIT ? e.amountCfa : -e.amountCfa;
      if (e.bucket === LedgerBucket.HELD) line.heldCfa += signed;
      else line.creditedAvailableCfa += signed;
      if (e.kind === WalletLedgerKind.HELD_RELEASE) line.heldCfa -= e.amountCfa;
      perEvent.set(e.eventId, line);
    }

    const payments = paymentIds.size
      ? await this.prisma.client.paymentTransaction.findMany({
          where: { id: { in: [...paymentIds] }, tenantId },
          select: { eventId: true, amountCfa: true, commissionCfa: true }
        })
      : [];
    const gross = new Map<string, { grossCfa: number; commissionCfa: number }>();
    let commissionCfa = 0;
    for (const p of payments) {
      const g = gross.get(p.eventId) ?? { grossCfa: 0, commissionCfa: 0 };
      g.grossCfa += p.amountCfa;
      g.commissionCfa += p.commissionCfa ?? 0;
      gross.set(p.eventId, g);
      commissionCfa += p.commissionCfa ?? 0;
    }

    const eventIds = [...new Set([...perEvent.keys(), ...gross.keys()])];
    const events = eventIds.length
      ? await this.prisma.client.event.findMany({
          where: { id: { in: eventIds }, tenantId },
          select: { id: true, title: true }
        })
      : [];
    const byEvent = events.map((ev) => ({
      eventId: ev.id,
      title: ev.title,
      grossCfa: gross.get(ev.id)?.grossCfa ?? 0,
      commissionCfa: gross.get(ev.id)?.commissionCfa ?? 0,
      heldCfa: perEvent.get(ev.id)?.heldCfa ?? 0,
      creditedAvailableCfa: perEvent.get(ev.id)?.creditedAvailableCfa ?? 0
    }));

    return { commissionCfa, byEvent, ledgerUnknownEntries };
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
      const entry = await appendLedgerEntry(db, {
        walletId: wallet.id,
        kind: input.kind,
        direction: LedgerDirection.CREDIT,
        bucket: bucketOf(input.target),
        amountCfa: input.amountCfa,
        eventId: input.eventId,
        paymentId: input.paymentId,
        withdrawalId: input.withdrawalId,
        note: input.note
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
        heldEntry = await appendLedgerEntry(db, {
          walletId: wallet.id,
          kind: WalletLedgerKind.HELD_ALLOCATION,
          direction: LedgerDirection.CREDIT,
          bucket: LedgerBucket.HELD,
          amountCfa: heldCfa,
          eventId: input.eventId,
          paymentId: input.paymentId,
          note: input.note ? `${input.note} (réserve)` : "Réserve de sécurité"
        });
      }

      let withdrawableEntry: WalletLedgerEntry | null = null;
      if (withdrawableCfa > 0) {
        withdrawableEntry = await appendLedgerEntry(db, {
          walletId: wallet.id,
          kind: input.kind,
          direction: LedgerDirection.CREDIT,
          bucket: LedgerBucket.WITHDRAWABLE,
          amountCfa: withdrawableCfa,
          eventId: input.eventId,
          paymentId: input.paymentId,
          note: input.note
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

      // CAS (compare-and-swap): the WHERE re-asserts a sufficient balance at
      // write time, not just at the read above — closes a TOCTOU race where
      // two concurrent debits (e.g. two withdrawal requests) both pass the
      // plain read-then-check and both decrement, driving the balance
      // negative. Same pattern as the atomic `updateMany` claim already used
      // for event closure (EventSettlementService.closeEvent).
      const claim =
        input.from === "held"
          ? await db.organizerWallet.updateMany({
              where: { id: wallet.id, heldCfa: { gte: input.amountCfa } },
              data: { heldCfa: { decrement: input.amountCfa } }
            })
          : await db.organizerWallet.updateMany({
              where: { id: wallet.id, withdrawableCfa: { gte: input.amountCfa } },
              data: { withdrawableCfa: { decrement: input.amountCfa } }
            });
      if (claim.count === 0) {
        const balance = input.from === "held" ? wallet.heldCfa : wallet.withdrawableCfa;
        const label = input.from === "held" ? "en réserve" : "disponible";
        throw new ConflictException(
          `Solde ${label} insuffisant (${balance} FCFA) pour débiter ${input.amountCfa} FCFA.`
        );
      }
      const updated = await db.organizerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const entry = await appendLedgerEntry(db, {
        walletId: wallet.id,
        kind: input.kind,
        direction: LedgerDirection.DEBIT,
        bucket: bucketOf(input.from),
        amountCfa: input.amountCfa,
        eventId: input.eventId,
        paymentId: input.paymentId,
        withdrawalId: input.withdrawalId,
        note: input.note
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
      // Same CAS pattern as debit(): re-assert the held balance at write
      // time, not just at the read above.
      const claim = await db.organizerWallet.updateMany({
        where: { id: wallet.id, heldCfa: { gte: args.amountCfa } },
        data: {
          heldCfa: { decrement: args.amountCfa },
          withdrawableCfa: { increment: args.amountCfa }
        }
      });
      if (claim.count === 0) {
        throw new ConflictException(
          `Impossible de libérer ${args.amountCfa} FCFA : solde en réserve insuffisant (${wallet.heldCfa} FCFA).`
        );
      }
      const updated = await db.organizerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      // Transfert : une seule ligne CREDIT WITHDRAWABLE, débit implicite de HELD (ADR-021).
      const entry = await appendLedgerEntry(db, {
        walletId: wallet.id,
        kind: WalletLedgerKind.HELD_RELEASE,
        direction: LedgerDirection.CREDIT,
        bucket: LedgerBucket.WITHDRAWABLE,
        amountCfa: args.amountCfa,
        eventId: args.eventId,
        note: args.note ?? "Libération held → withdrawable"
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
