import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { EventStatus, PaymentProvider } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { assertTestDatabase, prisma, resetDatabase } from "../../test-utils/db";
import { OrganizerSecretsService } from "../../organizer-secrets/organizer-secrets.service";
import { PlatformSecretsService } from "../../platform-control/platform-secrets.service";
import { FEEXPAY_API_SECRET_KEY, FEDAPAY_API_SECRET_KEY } from "../../common/payment-secrets";
import { env } from "../../config/env";
import { PspRegistry } from "./psp.registry";
import { FeexpayGateway } from "./feexpay.gateway";
import { FedapayGateway } from "./fedapay.gateway";
import { KkiapayGateway } from "./kkiapay.gateway";

const prismaService = new PrismaService();
const secrets = new OrganizerSecretsService(prismaService);
const platformSecrets = new PlatformSecretsService(prismaService);
const registry = new PspRegistry(
  prismaService,
  secrets,
  platformSecrets,
  new FeexpayGateway(),
  new FedapayGateway(),
  new KkiapayGateway()
);

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

test("get() returns the gateway whose .provider matches", () => {
  assert.equal(registry.get(PaymentProvider.FEEXPAY).provider, PaymentProvider.FEEXPAY);
  assert.equal(registry.get(PaymentProvider.FEDAPAY).provider, PaymentProvider.FEDAPAY);
  assert.equal(registry.get(PaymentProvider.KKIAPAY).provider, PaymentProvider.KKIAPAY);
});

test("resolveProvider: event override wins over tenant and default", async () => {
  const { tenant, event } = await seed({ tenantProvider: PaymentProvider.FEEXPAY, eventProvider: PaymentProvider.FEDAPAY });
  const p = await registry.resolveProvider({ eventId: event.id, tenantId: tenant.id });
  assert.equal(p, PaymentProvider.FEDAPAY);
});

test("resolveProvider: tenant default applies when event has no override", async () => {
  const { tenant, event } = await seed({ tenantProvider: PaymentProvider.KKIAPAY, eventProvider: null });
  const p = await registry.resolveProvider({ eventId: event.id, tenantId: tenant.id });
  assert.equal(p, PaymentProvider.KKIAPAY);
});

test("resolveProvider: platform default (FEEXPAY) when neither event nor tenant pins one", async () => {
  const { tenant, event } = await seed({ tenantProvider: null, eventProvider: null });
  const p = await registry.resolveProvider({ eventId: event.id, tenantId: tenant.id });
  assert.equal(p, PaymentProvider.FEEXPAY);
});

test("resolveProvider: without eventId falls back to tenant then default", async () => {
  const { tenant } = await seed({ tenantProvider: PaymentProvider.FEDAPAY, eventProvider: null });
  const p = await registry.resolveProvider({ tenantId: tenant.id });
  assert.equal(p, PaymentProvider.FEDAPAY);
});

test("resolveCredentials returns per-provider creds", () => {
  assert.ok(registry.resolveCredentials(PaymentProvider.FEEXPAY).apiKey.length > 0);
  assert.ok(registry.resolveCredentials(PaymentProvider.FEDAPAY).apiKey.length > 0);
  assert.ok(registry.resolveCredentials(PaymentProvider.KKIAPAY).apiKey.length > 0);
});

test("resolveVotePayinCredentials: clé organisateur pour les votes, pas pour l'activation", async () => {
  const { tenant, event } = await seed({ tenantProvider: null, eventProvider: null });
  const secrets = new OrganizerSecretsService(prismaService);
  const owner = { userId: "u1", tenantId: tenant.id, email: "o@t.bj", role: "ORGANIZER_OWNER" as const };
  await secrets.saveSecret(owner, { key: FEEXPAY_API_SECRET_KEY, value: "fp_live_organizer_key_123" });

  const voteCreds = await registry.resolveVotePayinCredentials({
    eventId: event.id,
    tenantId: tenant.id
  });
  assert.equal(voteCreds.apiKey, "fp_live_organizer_key_123");

  const activationCreds = await registry.resolvePlatformCredentials(PaymentProvider.FEEXPAY);
  assert.equal(activationCreds.apiKey, env.FEEXPAY_API_KEY);
  assert.notEqual(activationCreds.apiKey, voteCreds.apiKey);
});

test("resolveVotePayinCredentials route la clé orga FedaPay", async () => {
  const { tenant, event } = await seed({ tenantProvider: PaymentProvider.FEDAPAY });
  const owner = { userId: "u", tenantId: tenant.id, email: "o@t.bj", role: "ORGANIZER_OWNER" as const };
  await secrets.saveSecret(owner, { key: FEDAPAY_API_SECRET_KEY, value: "sk_orga_fedapay" });

  const creds = await registry.resolveVotePayinCredentials({ eventId: event.id, tenantId: tenant.id });
  assert.equal(creds.apiKey, "sk_orga_fedapay");
});

test("resolveVotePayinCredentials: évènement partenaire → clé plateforme", async () => {
  const { tenant, event } = await seed({ tenantProvider: null, eventProvider: null });
  const owner = { userId: "u1", tenantId: tenant.id, email: "o@t.bj", role: "ORGANIZER_OWNER" as const };
  await secrets.saveSecret(owner, { key: FEEXPAY_API_SECRET_KEY, value: "fp_live_organizer_key_123" });
  await prisma.event.update({ where: { id: event.id }, data: { isPartnerEvent: true } });

  const voteCreds = await registry.resolveVotePayinCredentials({
    eventId: event.id,
    tenantId: tenant.id
  });
  const platformCreds = await registry.resolvePlatformCredentials(PaymentProvider.FEEXPAY);
  assert.equal(voteCreds.apiKey, platformCreds.apiKey);
  assert.notEqual(voteCreds.apiKey, "fp_live_organizer_key_123");
});
