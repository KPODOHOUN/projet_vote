import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "crypto";
import { env } from "../config/env";
import { OffersCronController } from "./offers-cron.controller";
import type { EventSettlementService } from "./event-settlement.service";

test("cron clôture: signature valide transmet la limite au service", async () => {
  let receivedLimit = 0;
  const settlement = {
    closeExpiredEvents: async (limit: number) => {
      receivedLimit = limit;
      return { selected: 1, closed: 1, skipped: 0, failed: 0, failures: [] };
    }
  } as Pick<EventSettlementService, "closeExpiredEvents">;
  const controller = new OffersCronController(settlement as EventSettlementService);
  const body = { limit: 25, runAtIso: new Date().toISOString() };
  const canonical = JSON.stringify({ limit: body.limit, runAtIso: body.runAtIso });
  const signature = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
    .update(canonical)
    .digest("hex");

  const result = await controller.closeExpired(body, signature);

  assert.equal(receivedLimit, 25);
  assert.equal(result.closed, 1);
});

test("cron clôture: signature invalide est rejetée", async () => {
  const settlement = {
    closeExpiredEvents: async () => ({
      selected: 0,
      closed: 0,
      skipped: 0,
      failed: 0,
      failures: []
    })
  } as Pick<EventSettlementService, "closeExpiredEvents">;
  const controller = new OffersCronController(settlement as EventSettlementService);

  await assert.rejects(
    controller.closeExpired(
      { limit: 10, runAtIso: new Date().toISOString() },
      "0".repeat(64)
    ),
    /Signature cron invalide/
  );
});
