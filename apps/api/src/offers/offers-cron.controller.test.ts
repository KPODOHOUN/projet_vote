import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { CRON_ROUTES, signCronRequest } from "../common/cron-signature";
import { OffersCronController } from "./offers-cron.controller";
import type { EventSettlementService } from "./event-settlement.service";

const settlementSpy = () => {
  const calls: number[] = [];
  const settlement = {
    closeExpiredEvents: async (limit: number) => {
      calls.push(limit);
      return { selected: 1, closed: 1, skipped: 0, failed: 0, failures: [] };
    },
    releaseMaturedHeld: async () => ({ selected: 0, released: 0, skipped: 0, failed: 0, failures: [] })
  } as unknown as EventSettlementService;
  return { calls, controller: new OffersCronController(settlement) };
};

test("cron clôture: signature valide transmet la limite au service", async () => {
  const { calls, controller } = settlementSpy();
  const body = { limit: 25, runAtIso: new Date().toISOString() };
  const result = await controller.closeExpired(body, signCronRequest(CRON_ROUTES.closeExpired, body));
  assert.deepEqual(calls, [25]);
  assert.equal(result.closed, 1);
});

test("cron clôture: signature invalide est rejetée", async () => {
  const { controller } = settlementSpy();
  await assert.rejects(
    controller.closeExpired({ limit: 10, runAtIso: new Date().toISOString() }, "0".repeat(64)),
    /Signature cron invalide/
  );
});

test("cron : une signature valable pour une route est refusée sur une autre", async () => {
  const { calls, controller } = settlementSpy();
  const body = { limit: 10, runAtIso: new Date().toISOString() };
  const releaseSignature = signCronRequest(CRON_ROUTES.releaseHeld, body);
  await assert.rejects(controller.closeExpired(body, releaseSignature), /Signature cron invalide/);
  assert.deepEqual(calls, []);
});

test("cron : runAtIso obligatoire et borné dans le temps (pas de rejeu tardif)", async () => {
  const { controller } = settlementSpy();
  const noDate = { limit: 10 };
  await assert.rejects(controller.closeExpired(noDate, signCronRequest(CRON_ROUTES.closeExpired, noDate)), /runAtIso requis/);
  const old = { limit: 10, runAtIso: new Date(Date.now() - 2 * 3_600_000).toISOString() };
  await assert.rejects(controller.closeExpired(old, signCronRequest(CRON_ROUTES.closeExpired, old)), /hors fenêtre/);
});
