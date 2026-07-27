import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizerSecretsService } from "./organizer-secrets.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const secrets = new OrganizerSecretsService(new PrismaService());

function user(tenantId: string) {
  return { userId: "u1", tenantId, email: "u@sec.bj", role: UserRole.ORGANIZER_OWNER };
}

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("save/get: round-trip chiffré + clair jamais stocké en base", async () => {
  const t = await prisma.tenant.create({ data: { slug: "sec-test", displayName: "Sec" } });
  await secrets.saveSecret(user(t.id), { key: "feexpay_api_secret", value: "SUPER_SECRET_123" });

  const read = await secrets.getSecret(user(t.id), "feexpay_api_secret");
  assert.equal(read.value, "SUPER_SECRET_123");

  const row = await prisma.tenantSecret.findUnique({
    where: { tenantId_key: { tenantId: t.id, key: "feexpay_api_secret" } }
  });
  assert.ok(row);
  assert.ok(!row.cipherText.includes("SUPER_SECRET_123")); // chiffré au repos
});

test("getSecret: isolation tenant (un autre tenant ne lit pas le secret)", async () => {
  const t1 = await prisma.tenant.create({ data: { slug: "sec-a", displayName: "A" } });
  const t2 = await prisma.tenant.create({ data: { slug: "sec-b", displayName: "B" } });
  await secrets.saveSecret(user(t1.id), { key: "shared_key", value: "v1" });
  await assert.rejects(secrets.getSecret(user(t2.id), "shared_key"), /introuvable/);
});

test("resolvePaymentSecret: override événement gagne, sinon fallback organisateur, sinon null", async () => {
  const t = await prisma.tenant.create({ data: { slug: "sec-res", displayName: "Res" } });
  const ev = await prisma.event.create({
    data: {
      tenantId: t.id,
      slug: "sec-evt",
      title: "Sec Evt",
      startsAt: new Date(Date.now() - 1e6),
      endsAt: new Date(Date.now() + 1e6)
    }
  });
  const key = "feexpay_api_secret";

  assert.equal(await secrets.resolvePaymentSecret(ev.id, t.id, key), null); // rien
  await secrets.saveSecret(user(t.id), { key, value: "ORG" });
  assert.equal(await secrets.resolvePaymentSecret(ev.id, t.id, key), "ORG"); // fallback org
  await secrets.saveEventSecret(user(t.id), ev.id, { key, value: "EVENT" });
  assert.equal(await secrets.resolvePaymentSecret(ev.id, t.id, key), "EVENT"); // override event
});

test("getSecretStatus + getPaymentSetupStatus sans exposer la valeur", async () => {
  const t = await prisma.tenant.create({ data: { slug: "sec-st", displayName: "St" } });
  const key = "feexpay_api_secret";
  const status = await secrets.getSecretStatus(user(t.id), key);
  assert.equal(status.configured, false);
  assert.equal(status.maskedValue, null);

  await secrets.saveSecret(user(t.id), { key, value: "fp_live_test_key_12345" });
  const after = await secrets.getSecretStatus(user(t.id), key);
  assert.equal(after.configured, true);
  assert.equal(after.maskedValue, "••••••••");

  const setup = await secrets.getPaymentSetupStatus(user(t.id));
  assert.equal(setup.organizerConfigured, true);
  assert.equal(setup.readyForVotes, true);
});

test("getPaymentSetupStatus reflète le provider résolu (KkiaPay = 3 clés)", async () => {
  const t = await prisma.tenant.create({
    data: { slug: "kki-org", displayName: "Kki", provider: "KKIAPAY" }
  });
  // aucune clé configurée → not ready sur crédentiels orga
  const setup = await secrets.getPaymentSetupStatus(user(t.id));
  assert.equal(setup.provider, "KKIAPAY");
  assert.equal(setup.organizerConfigured, false);

  // une seule des 3 clés KkiaPay → toujours pas configuré (les 3 requises)
  await secrets.saveSecret(user(t.id), { key: "kkiapay_public_key", value: "pub_only" });
  const partial = await secrets.getPaymentSetupStatus(user(t.id));
  assert.equal(partial.organizerConfigured, false);

  // les 3 clés → configuré
  await secrets.saveSecret(user(t.id), { key: "kkiapay_private_key", value: "priv" });
  await secrets.saveSecret(user(t.id), { key: "kkiapay_secret_key", value: "sec" });
  const full = await secrets.getPaymentSetupStatus(user(t.id));
  assert.equal(full.organizerConfigured, true);
});
