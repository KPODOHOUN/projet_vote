import type { UserRole } from "@prisma/client";

export type AuthUser = {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
};
