import { LedgerBucket, LedgerDirection, Prisma, WalletLedgerKind } from "@prisma/client";

export type LedgerEntryInput = {
  walletId: string;
  kind: WalletLedgerKind;
  /** ADR-021 : obligatoire pour toute nouvelle écriture. */
  direction: LedgerDirection;
  /** ADR-021 : compartiment touché. HELD_RELEASE s'écrit CREDIT WITHDRAWABLE. */
  bucket: LedgerBucket;
  amountCfa: number;
  eventId?: string | null | undefined;
  paymentId?: string | null | undefined;
  withdrawalId?: string | null | undefined;
  note?: string | null | undefined;
};

export function bucketOf(side: "held" | "withdrawable"): LedgerBucket {
  return side === "held" ? LedgerBucket.HELD : LedgerBucket.WITHDRAWABLE;
}

/**
 * Seul point d'écriture du journal wallet (ADR-021, vérifié par
 * ledger-entry.test.ts). Toujours appelé dans la transaction qui modifie le solde.
 */
export function appendLedgerEntry(db: Prisma.TransactionClient, input: LedgerEntryInput) {
  return db.walletLedgerEntry.create({
    data: {
      walletId: input.walletId,
      kind: input.kind,
      direction: input.direction,
      bucket: input.bucket,
      amountCfa: input.amountCfa,
      eventId: input.eventId ?? null,
      paymentId: input.paymentId ?? null,
      withdrawalId: input.withdrawalId ?? null,
      note: input.note ?? null
    }
  });
}
