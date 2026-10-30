import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";

/**
 * Fourchette publique de commission (business plan §5.5). En sortir exige
 * PLATFORM_SUPER_ADMIN. Source de vérité unique — tout endpoint qui écrit un
 * taux (Event.commissionBps, CommissionRate d'un organisateur, taux par défaut)
 * doit passer par cette fonction.
 */
export const COMMISSION_FLOOR_BPS = 400; // 4%
export const COMMISSION_CEILING_BPS = 1_200; // 12%

export function assertCommissionBpsAllowed(user: AuthUser, bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new BadRequestException("Le taux de commission doit être un entier entre 0 et 10000 (bps).");
  }
  const outOfRange = bps < COMMISSION_FLOOR_BPS || bps > COMMISSION_CEILING_BPS;
  if (outOfRange && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
    throw new ForbiddenException(
      `Un taux hors de la fourchette ${COMMISSION_FLOOR_BPS}-${COMMISSION_CEILING_BPS} bps nécessite le rôle super-admin.`
    );
  }
}
