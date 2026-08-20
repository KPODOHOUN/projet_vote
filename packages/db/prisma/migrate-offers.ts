/**
 * One-shot data migration helper: map existing tenants to offerType.
 * Run via: npx tsx packages/db/prisma/migrate-offers.ts (with DATABASE_URL)
 */
import { PrismaClient, TenantOfferType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      isPartner: true,
      secrets: { select: { id: true }, take: 1 },
      events: { where: { isPartnerEvent: true }, select: { id: true }, take: 1 }
    }
  });

  let escrow = 0;
  let external = 0;

  for (const t of tenants) {
    const useEscrow = t.isPartner || t.events.length > 0 || t.secrets.length === 0;
    const offerType = useEscrow ? TenantOfferType.ESCROW : TenantOfferType.EXTERNAL;
    await prisma.tenant.update({ where: { id: t.id }, data: { offerType } });
    if (offerType === TenantOfferType.ESCROW) {
      escrow += 1;
      await prisma.organizerWallet.upsert({
        where: { tenantId: t.id },
        create: { tenantId: t.id },
        update: {}
      });
    } else {
      external += 1;
    }
  }

  console.log(JSON.stringify({ migrated: tenants.length, escrow, external }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
