-- Adds the PLATFORM_SUPER_ADMIN role, a tier above PLATFORM_ADMIN. Reserved
-- to operations that even the regular platform admin must not perform
-- (e.g. read the deleted-votes vault). Postgres requires ALTER TYPE outside
-- a transaction block; Prisma runs each migration.sql as its own statement.
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_SUPER_ADMIN';
