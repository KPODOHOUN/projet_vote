import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { ObservabilityController } from "./observability.controller";
import type { ObservabilityService } from "./observability.service";
import { env } from "../config/env";

const snapshot = {
  windowSeconds: 300,
  totalRequests: 0,
  errorRequests: 0,
  errorRate: 0,
  p95DurationMs: 0,
  computedAt: "now"
} as const;
const svc = { getSnapshot: () => snapshot } as unknown as ObservabilityService;

test("ops/metrics: refuse un token absent ou invalide (timing-safe)", () => {
  const ctrl = new ObservabilityController(svc);
  assert.throws(() => ctrl.getMetrics(undefined), /Token ops invalide/);
  assert.throws(() => ctrl.getMetrics("wrong"), /Token ops invalide/);
});

test("ops/metrics: renvoie le snapshot avec le bon token", () => {
  const ctrl = new ObservabilityController(svc);
  assert.deepEqual(ctrl.getMetrics(env.API_OPS_TOKEN), snapshot);
});
