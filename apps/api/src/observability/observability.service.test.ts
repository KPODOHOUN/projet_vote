import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { ObservabilityService } from "./observability.service";

// Pure in-memory service — no DB. Exercises the p95 / error-rate maths and the
// sliding-window pruning directly.

test("getSnapshot: total, error rate et p95 sur 10 échantillons", () => {
  const svc = new ObservabilityService();
  const now = Date.now();
  for (let i = 1; i <= 10; i += 1) {
    svc.recordRequest({ timestamp: now, durationMs: i * 10, statusCode: i <= 8 ? 200 : 500 });
  }
  const snap = svc.getSnapshot();
  assert.equal(snap.totalRequests, 10);
  assert.equal(snap.errorRequests, 2);
  assert.equal(snap.errorRate, 0.2);
  assert.equal(snap.p95DurationMs, 100); // index ceil(10*0.95)-1 = 9 → 100ms
});

test("getSnapshot: ignore les échantillons hors fenêtre de 5 min", () => {
  const svc = new ObservabilityService();
  svc.recordRequest({ timestamp: Date.now() - 6 * 60_000, durationMs: 999, statusCode: 200 });
  svc.recordRequest({ timestamp: Date.now(), durationMs: 50, statusCode: 200 });
  const snap = svc.getSnapshot();
  assert.equal(snap.totalRequests, 1);
  assert.equal(snap.p95DurationMs, 50);
});

test("getSnapshot: état vide", () => {
  const snap = new ObservabilityService().getSnapshot();
  assert.equal(snap.totalRequests, 0);
  assert.equal(snap.errorRate, 0);
  assert.equal(snap.p95DurationMs, 0);
});
