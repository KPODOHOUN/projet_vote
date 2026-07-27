/**
 * Narrow on Prisma's well-known error codes without importing the Prisma
 * namespace, keeping callers dependency-light. P2002 = unique constraint
 * violation (e.g. a duplicate tenant slug or globally-unique event slug).
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
