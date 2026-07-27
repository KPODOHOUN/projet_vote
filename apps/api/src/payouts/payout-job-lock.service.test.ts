import "reflect-metadata";
import { test, before, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { assertTestDatabase, prisma, resetDatabase } from "../test-utils/db";

const prismaService = new PrismaService();
const lock = new PayoutJobLockService(prismaService);

before(() => assertTestDatabase());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test("acquire: le 1er process l'obtient ; le 2e est refusé", async () => {
  assert.equal(await lock.acquire("payout-job", "worker-A", 10_000), true);
  assert.equal(await lock.acquire("payout-job", "worker-B", 10_000), false);
});

test("release par le propriétaire libère le verrou", async () => {
  await lock.acquire("job", "A", 10_000);
  await lock.release("job", "A");
  assert.equal(await lock.acquire("job", "B", 10_000), true);
});

test("verrou expiré: un autre worker peut prendre la main", async () => {
  await lock.acquire("job", "A", 1);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await lock.acquire("job", "B", 10_000), true);
});
