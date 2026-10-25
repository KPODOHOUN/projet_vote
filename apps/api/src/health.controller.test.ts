import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import type { PrismaService } from "./prisma/prisma.service";

function controllerWith(queryRaw: () => Promise<unknown>, timeoutMs?: number) {
  const prisma = { client: { $queryRaw: queryRaw } } as unknown as PrismaService;
  return new HealthController(prisma, timeoutMs);
}

test("health : vivacité sans base de données (ne touche jamais Prisma)", () => {
  const controller = controllerWith(() => Promise.reject(new Error("ne doit pas être appelé")));
  assert.equal(controller.getHealth().version, "v1");
});

test("health/ready : base joignable → ready, check database ok", async () => {
  const controller = controllerWith(() => Promise.resolve([{ "?column?": 1 }]));
  const body = await controller.getReadiness();
  assert.equal(body.status, "ready");
  assert.deepEqual(body.checks, { database: "ok" });
});

test("health/ready : base en erreur → 503 sans détail interne", async () => {
  const controller = controllerWith(() => Promise.reject(new Error("password authentication failed for user votezpro")));
  await assert.rejects(controller.getReadiness(), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailableException);
    const response = error.getResponse() as Record<string, unknown>;
    assert.equal(response.status, "not_ready");
    assert.deepEqual(response.checks, { database: "unreachable" });
    assert.ok(!JSON.stringify(response).includes("password"), "aucune fuite du message d'erreur");
    return true;
  });
});

test("health/ready : base qui ne répond pas → 503 après le délai, sans attendre indéfiniment", async () => {
  const controller = controllerWith(() => new Promise(() => {}), 50);
  const started = Date.now();
  await assert.rejects(controller.getReadiness(), ServiceUnavailableException);
  assert.ok(Date.now() - started < 1_000);
});
