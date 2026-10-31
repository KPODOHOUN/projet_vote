import type { Prisma } from "@prisma/client";

/**
 * Traces conservées sans limite : argent (paiements, retraits, commissions,
 * numéro de retrait), contrats, clôtures, comptes supprimés et actions des
 * administrateurs. Ni la purge ni la suppression manuelle ne les effacent —
 * elles sont la preuve en cas de litige ou de contrôle.
 */
const PROTECTED_AUDIT_ACTION_PREFIXES = [
  "payment.",
  "withdrawal.",
  "commission.",
  "payout_destination.",
  "platform.finance_",
  "contract.",
  "event.closed",
  "event.archived",
  "user.deleted",
  "privacy.",
  "admin.",
  "api_key.",
  "maintenance.purge_executed",
  "vote.cancelled"
] as const;

export function isProtectedAuditAction(action: string): boolean {
  return PROTECTED_AUDIT_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

/** Filtre à ajouter à toute suppression d'audit : exclut les traces conservées. */
export const DELETABLE_AUDIT_LOGS: Prisma.AuditLogWhereInput = {
  NOT: PROTECTED_AUDIT_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } }))
};

export const PROTECTED_AUDIT_MESSAGE = "Cette trace (argent, contrat ou administration) est conservée : elle ne peut pas être supprimée.";
