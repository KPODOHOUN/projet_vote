import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VaultOtpService } from "./vault-otp.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const otp = new VaultOtpService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

async function makeSuperAdmin() {
  const tenant = await prisma.tenant.create({ data: { slug: "sa-org", displayName: "SA" } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "su@votez.pro",
      passwordHash: "x",
      role: UserRole.PLATFORM_SUPER_ADMIN
    }
  });
  return { tenant, user };
}

test("requestUnlock crée un challenge ; sans service d'e-mail (tests), le code est rendu pour l'automatisation", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  assert.match(code ?? "", /^\d{6}$/);
  const row = await prisma.vaultUnlockChallenge.findUniqueOrThrow({ where: { id: challengeId } });
  assert.notEqual(row.codeHash, code, "le code stocké est haché");
});

test("confirmUnlock retourne un token de 10 min ; ré-utilisation refusée", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  const token = await otp.confirmUnlock(user.id, challengeId, code!);
  assert.ok(token.length > 20);
  await assert.rejects(otp.confirmUnlock(user.id, challengeId, code!), /déjà utilisé|invalide|bloqué/);
});

test("confirmUnlock : 5 essais ratés → challenge bloqué", async () => {
  const { user } = await makeSuperAdmin();
  const { challengeId } = await otp.requestUnlock(user.id);
  for (let i = 0; i < 5; i += 1) {
    await otp.confirmUnlock(user.id, challengeId, "000000").catch(() => null);
  }
  await assert.rejects(otp.confirmUnlock(user.id, challengeId, "000000"), /bloqué|invalide/);
});

test("verifyToken : token valide accepté, token forgé refusé", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  const token = await otp.confirmUnlock(user.id, challengeId, code!);
  assert.equal(otp.verifyToken(token, user.id), true);
  assert.equal(otp.verifyToken("invalid.token.here", user.id), false);
});

test("le code part par e-mail : jamais dans la réponse quand l'envoi réussit", async () => {
  const { user } = await makeSuperAdmin();
  const sent: Array<{ to: string[]; html: string }> = [];
  const withMail = new VaultOtpService(prismaService, { send: async (payload: { to: string[]; html: string }) => { sent.push(payload); return true; } } as never);
  const response = await withMail.requestUnlock(user.id);
  assert.equal("code" in response, false);
  assert.deepEqual(sent[0]!.to, ["su@votez.pro"]);
  assert.match(sent[0]!.html, /\d{6}/);
});

test("essais en parallèle : jamais plus de 5 codes comparés", async () => {
  const { user } = await makeSuperAdmin();
  const { code, challengeId } = await otp.requestUnlock(user.id);
  const guesses = Array.from({ length: 40 }, (_, i) => String(i).padStart(6, "0")).filter((g) => g !== code);
  const results = await Promise.allSettled(guesses.map((g) => otp.confirmUnlock(user.id, challengeId, g)));
  const compared = results.filter((r) => r.status === "rejected" && /Code invalide/.test((r.reason as Error).message)).length;
  assert.ok(compared <= 5, `${compared} codes comparés`);
  await assert.rejects(otp.confirmUnlock(user.id, challengeId, code!), /bloqué/);
});
