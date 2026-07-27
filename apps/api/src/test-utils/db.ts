import { prisma } from "@votezpro/db";

/**
 * Real-database test utilities.
 *
 * Integration and service tests run against a real PostgreSQL database
 * (DATABASE_URL must point at a disposable test database, e.g. `votezpro_test`).
 * No mock Prisma client is used anywhere — every assertion exercises the real
 * query path, constraints, cascades and tenant scoping.
 */
export { prisma };

const TABLES = [
  "Vote",
  "Candidate",
  "Event",
  "PaymentTransaction",
  "IdempotencyKey",
  "AuditLog",
  "AuthSession",
  "TenantSecret",
  "LoginAttempt",
  "PlatformSetting",
  "PlatformSecret",
  "ActivationRecovery",
  "ActivationDebt",
  "PartnerOfferTier",
  "PartnerRequest",
  "VaultEntry",
  "VaultUnlockChallenge",
  "PayoutLine",
  "Payout",
  "PayoutPeriod",
  "PayoutJobLock",
  "Notification",
  "AuthEmailToken",
  "User",
  "Tenant"
] as const;

/**
 * Wipe all application tables between tests. `RESTART IDENTITY CASCADE` keeps
 * runs deterministic and order-independent regardless of foreign keys.
 */
export async function resetDatabase(): Promise<void> {
  const quoted = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
}

/**
 * Guard against ever running destructive resets on a non-test database.
 * Called once before the suite. Throws if DATABASE_URL doesn't target a
 * database whose name ends with `_test`.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = url.split("/").pop()?.split("?")[0] ?? "";
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refus d'exécuter les tests destructifs : DATABASE_URL doit cibler une base *_test (reçu: "${dbName}").`
    );
  }
}
