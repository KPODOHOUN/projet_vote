import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OfferSettingsService } from "./offer-settings.service";
import { COMMISSION_DEFAULT_BPS_KEY, DEFAULT_COMMISSION_BPS } from "../common/platform-settings";

const prisma = new PrismaService();
const offerSettings = new OfferSettingsService(prisma);
const admin = (tenantId: string) => ({ userId: "admin-test", tenantId, email: "admin@test.bj", role: UserRole.PLATFORM_ADMIN });
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function seedEvent(eventCommissionBps: number | null = null) {
  const tenant = await prisma.client.tenant.create({ data: { slug: `fin-${uid()}`, displayName: "Finance" } });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Concours",
      slug: `ev-${uid()}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      commissionBps: eventCommissionBps
    }
  });
  return { tenant, event };
}

test("taux par défaut : 12 % tant qu'aucun réglage ni taux négocié n'existe", async () => {
  await prisma.client.platformSetting.deleteMany({ where: { key: COMMISSION_DEFAULT_BPS_KEY } });
  assert.equal(DEFAULT_COMMISSION_BPS, 1_200);
  const { event } = await seedEvent();
  assert.equal(await offerSettings.resolveCommissionBps(event.id), 1_200);
  assert.equal((await offerSettings.getSettings()).commissionDefaultBps, 1_200);
});

test("taux négocié : appliqué à partir de sa date d'effet, jamais avant", async () => {
  const { tenant, event } = await seedEvent();
  await prisma.client.commissionRate.create({
    data: { tenantId: tenant.id, bps: 900, effectiveFrom: new Date(Date.now() - 60_000), reason: "Accord", createdByUserId: "admin" }
  });
  await prisma.client.commissionRate.create({
    data: { tenantId: tenant.id, bps: 700, effectiveFrom: new Date(Date.now() + 7 * 86_400_000), reason: "Accord futur", createdByUserId: "admin" }
  });
  assert.equal(await offerSettings.resolveCommissionBps(event.id), 900, "le taux futur ne s'applique pas encore");
  const later = await offerSettings.resolveTenantCommissionBps(tenant.id, new Date(Date.now() + 8 * 86_400_000));
  assert.deepEqual(later, { bps: 700, source: "tenant" });
});

test("le taux figé par le contrat du concours l'emporte sur le taux négocié", async () => {
  const { tenant, event } = await seedEvent(1_100);
  await prisma.client.commissionRate.create({
    data: { tenantId: tenant.id, bps: 500, effectiveFrom: new Date(Date.now() - 60_000), reason: "Accord", createdByUserId: "admin" }
  });
  assert.equal(await offerSettings.resolveCommissionBps(event.id), 1_100);
  const described = await offerSettings.describeEventCommission(event.id);
  assert.equal(described.source, "event");
  assert.equal(described.tenantBps, 500);
});

test("calcul : francs CFA entiers, arrondi à l'unité inférieure, jamais négatif", () => {
  assert.equal(offerSettings.computeCommissionCfa(1_000, 1_200), 120);
  assert.equal(offerSettings.computeCommissionCfa(205, 1_200), 24); // 24,6 → 24
  assert.equal(offerSettings.computeCommissionCfa(1, 1_200), 0);
  assert.equal(offerSettings.computeCommissionCfa(0, 1_200), 0);
  assert.equal(offerSettings.computeCommissionCfa(1_000, 0), 0);
});

test("réglages : un admin ne sort pas de la fourchette, chaque changement est journalisé", async () => {
  const { tenant } = await seedEvent();
  await assert.rejects(offerSettings.updateSettings(admin(tenant.id), { commissionDefaultBps: 2_500 }), /super-admin/);
  const updated = await offerSettings.updateSettings(admin(tenant.id), { commissionDefaultBps: 1_000, heldBps: 4_000 });
  assert.equal(updated.commissionDefaultBps, 1_000);
  assert.equal(updated.heldBps, 4_000);
  const audit = await prisma.client.auditLog.findFirst({
    where: { tenantId: tenant.id, action: "platform.finance_settings_updated" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "modification journalisée");
  // Remise à l'état par défaut pour les autres tests.
  await prisma.client.platformSetting.deleteMany({ where: { key: { in: [COMMISSION_DEFAULT_BPS_KEY, "settlement_held_bps"] } } });
});
