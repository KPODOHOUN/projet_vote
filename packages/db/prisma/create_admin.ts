import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const platformTenant = await prisma.tenant.upsert({
    where: { slug: "shadoma-platform" },
    update: { displayName: "SHADOMA Votes (Plateforme)" },
    create: { slug: "shadoma-platform", displayName: "SHADOMA Votes (Plateforme)" }
  });

  const adminPasswordHash = await hash("SecurePass123!", 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: platformTenant.id, email: "admin@shadoma.africa" } },
    update: {
      passwordHash: adminPasswordHash,
      role: UserRole.PLATFORM_ADMIN,
      emailVerifiedAt: new Date()
    },
    create: {
      tenantId: platformTenant.id,
      email: "admin@shadoma.africa",
      passwordHash: adminPasswordHash,
      role: UserRole.PLATFORM_ADMIN,
      emailVerifiedAt: new Date()
    }
  });

  console.log("Admin created successfully:", admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
