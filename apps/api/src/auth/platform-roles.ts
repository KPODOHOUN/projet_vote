import { UserRole } from "@prisma/client";

/** Rôles avec accès opérateur plateforme (god-mode, maintenance, admin UI). */
export const PLATFORM_OPERATOR_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN] as const;

export const PLATFORM_SUPER_ADMIN_ROLES = [UserRole.PLATFORM_SUPER_ADMIN] as const;

export function isPlatformOperator(role: UserRole): boolean {
  return role === UserRole.PLATFORM_ADMIN || role === UserRole.PLATFORM_SUPER_ADMIN;
}
