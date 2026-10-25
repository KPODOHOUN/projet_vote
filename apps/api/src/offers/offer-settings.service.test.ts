import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../prisma/prisma.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, OFFER2_PER_VOTE_COMMISSION_BPS_KEY } from "../common/platform-settings";

const prisma = new PrismaService();
const offerSettings = new OfferSettingsService(prisma);

async function enablePerVoteCommission(defaultBps: number) {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "true", updatedByUserId: "test" },
    update: { value: "true" }
  });
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_BPS_KEY, value: String(defaultBps), updatedByUserId: "test" },
    update: { value: String(defaultBps) }
  });
}

test("resolveEscrowCommissionBps: utilise le taux plateforme par défaut sans override", async () => {
  await enablePerVoteCommission(800); // 8%
  const tenant = await prisma.client.tenant.create({
    data: { slug: `commis-none-${Date.now().toString(36)}`, displayName: "No Override" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event no override",
      slug: `ev-none-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 800);
});

test("resolveEscrowCommissionBps: l'override tenant prime sur le défaut plateforme", async () => {
  await enablePerVoteCommission(800);
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `commis-tenant-${Date.now().toString(36)}`,
      displayName: "Tenant Override",
      commissionBps: 600
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event tenant override",
      slug: `ev-tenant-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 600);
});

test("resolveEscrowCommissionBps: l'override event prime sur le tenant et le défaut", async () => {
  await enablePerVoteCommission(800);
  const tenant = await prisma.client.tenant.create({
    data: {
      slug: `commis-event-${Date.now().toString(36)}`,
      displayName: "Event Override",
      commissionBps: 600
    }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event override",
      slug: `ev-override-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      commissionBps: 450
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 450);
});

test("resolveEscrowCommissionBps: retourne 0 si la commission par vote est désactivée", async () => {
  await prisma.client.platformSetting.upsert({
    where: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY },
    create: { key: OFFER2_PER_VOTE_COMMISSION_ENABLED_KEY, value: "false", updatedByUserId: "test" },
    update: { value: "false" }
  });
  const tenant = await prisma.client.tenant.create({
    data: { slug: `commis-disabled-${Date.now().toString(36)}`, displayName: "Disabled" }
  });
  const event = await prisma.client.event.create({
    data: {
      tenantId: tenant.id,
      title: "Event disabled",
      slug: `ev-disabled-${Date.now().toString(36)}`,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const bps = await offerSettings.resolveEscrowCommissionBps(event.id);
  assert.equal(bps, 0);
});

test("computeEscrowVoteCommissionCfaFromBps: floor sur montant × bps / 10000", () => {
  assert.equal(offerSettings.computeEscrowVoteCommissionCfaFromBps(1_000, 800), 80);
  assert.equal(offerSettings.computeEscrowVoteCommissionCfaFromBps(1_000, 0), 0);
  assert.equal(offerSettings.computeEscrowVoteCommissionCfaFromBps(333, 800), 26);
});

test("describeEscrowCommission: taux effectif, source, bornes et gel", async () => {
  await enablePerVoteCommission(800);
  const suffix = Date.now().toString(36);
  const tenant = await prisma.client.tenant.create({
    data: { slug: `commis-desc-${suffix}`, displayName: "Describe", commissionBps: 600 }
  });
  const draft = await prisma.client.event.create({
    data: { tenantId: tenant.id, title: "Draft", slug: `ev-desc-d-${suffix}`, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000) }
  });
  const fromTenant = await offerSettings.describeEscrowCommission(draft.id);
  assert.deepEqual(
    { effectiveBps: fromTenant.effectiveBps, source: fromTenant.source, frozen: fromTenant.frozen },
    { effectiveBps: 600, source: "tenant", frozen: false }
  );
  assert.equal(fromTenant.floorBps, 400);
  assert.equal(fromTenant.ceilingBps, 1_200);
  assert.equal(fromTenant.defaultBps, 800);

  const active = await prisma.client.event.create({
    data: {
      tenantId: tenant.id, title: "Active", slug: `ev-desc-a-${suffix}`, status: "ACTIVE", commissionBps: 900,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000)
    }
  });
  const fromEvent = await offerSettings.describeEscrowCommission(active.id);
  assert.deepEqual(
    { effectiveBps: fromEvent.effectiveBps, source: fromEvent.source, frozen: fromEvent.frozen },
    { effectiveBps: 900, source: "event", frozen: true }
  );
});
