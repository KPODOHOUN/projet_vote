import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../../test-utils/db";
import { PlatformSecretsService } from "../../platform-control/platform-secrets.service";
import { env } from "../../config/env";
import { PspRegistry } from "./psp.registry";
import { FeexpayGateway } from "./feexpay.gateway";
import { FedapayGateway } from "./fedapay.gateway";

const prismaService = new PrismaService();
const registry = new PspRegistry(prismaService, new PlatformSecretsService(prismaService), new FeexpayGateway(), new FedapayGateway());

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function seed(opts: { tenantProvider?: PaymentProvider | null; eventProvider?: PaymentProvider | null }) {
  const tenant = await prisma.tenant.create({
    data: { slug: `reg-${Math.random().toString(36).slice(2, 8)}`, displayName: "Reg", provider: opts.tenantProvider ?? null }
  });
  const event = await prisma.event.create({
    data: {
      tenantId: tenant.id,
      slug: `evt-${Math.random().toString(36).slice(2, 8)}`,
      title: "Evt",
      status: EventStatus.ACTIVE,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 3_600_000),
      provider: opts.eventProvider ?? null
    }
  });
  return { tenant, event };
}

test("get() renvoie la passerelle du prestataire ; un prestataire retiré n'en a pas", () => {
  assert.equal(registry.get(PaymentProvider.FEEXPAY).provider, PaymentProvider.FEEXPAY);
  assert.equal(registry.get(PaymentProvider.FEDAPAY).provider, PaymentProvider.FEDAPAY);
  assert.throws(() => registry.get(PaymentProvider.KKIAPAY), /Aucun adaptateur/);
});

test("resolveProvider : le choix du concours l'emporte sur celui de l'organisateur et sur le défaut", async () => {
  const { tenant, event } = await seed({ tenantProvider: PaymentProvider.FEEXPAY, eventProvider: PaymentProvider.FEDAPAY });
  assert.equal(await registry.resolveProvider({ eventId: event.id, tenantId: tenant.id }), PaymentProvider.FEDAPAY);
});

test("resolveProvider : choix de l'organisateur, sinon défaut de la plateforme", async () => {
  const pinned = await seed({ tenantProvider: PaymentProvider.FEDAPAY });
  assert.equal(await registry.resolveProvider({ eventId: pinned.event.id, tenantId: pinned.tenant.id }), PaymentProvider.FEDAPAY);
  assert.equal(await registry.resolveProvider({ tenantId: pinned.tenant.id }), PaymentProvider.FEDAPAY);
  const free = await seed({});
  assert.equal(await registry.resolveProvider({ eventId: free.event.id, tenantId: free.tenant.id }), env.DEFAULT_PSP_PROVIDER);
});

test("identifiants : toujours le compte de la plateforme (SHADOMA encaisse tout)", async () => {
  assert.equal((await registry.resolvePlatformCredentials(PaymentProvider.FEDAPAY)).apiKey, env.FEDAPAY_API_KEY);
  assert.equal((await registry.resolvePlatformCredentials(PaymentProvider.FEEXPAY)).apiKey, env.FEEXPAY_API_KEY);
  await assert.rejects(registry.resolvePlatformCredentials(PaymentProvider.KKIAPAY), /Aucun compte de paiement/);
});
