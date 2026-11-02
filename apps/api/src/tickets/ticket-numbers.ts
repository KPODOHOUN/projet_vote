import type { Prisma } from "@prisma/client";

/**
 * Numéros lisibles des billets (N° 0001, 0002…) par type de billet, attribués
 * au paiement. Le compteur du type est incrémenté atomiquement (UPDATE …
 * RETURNING) : deux paiements confirmés en même temps ne reçoivent jamais le même numéro.
 */
export async function assignTicketNumbers(
  trx: Prisma.TransactionClient,
  tickets: ReadonlyArray<{ id: string; ticketTypeId: string }>
): Promise<void> {
  const byType = new Map<string, string[]>();
  for (const ticket of tickets) byType.set(ticket.ticketTypeId, [...(byType.get(ticket.ticketTypeId) ?? []), ticket.id]);
  for (const [ticketTypeId, ids] of byType) {
    const rows = await trx.$queryRaw<Array<{ issuedCount: number }>>`
      UPDATE "TicketType" SET "issuedCount" = "issuedCount" + ${ids.length}
      WHERE id = ${ticketTypeId} RETURNING "issuedCount"`;
    const last = rows[0]?.issuedCount;
    if (last === undefined) continue;
    const first = last - ids.length + 1;
    for (const [index, id] of ids.entries()) {
      await trx.ticket.update({ where: { id }, data: { number: first + index } });
    }
  }
}

/** Numéro affiché : « 0042 ». */
export function formatTicketNumber(number: number | null | undefined): string | null {
  return number ? String(number).padStart(4, "0") : null;
}
