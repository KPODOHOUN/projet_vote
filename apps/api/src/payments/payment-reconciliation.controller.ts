import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../config/env";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const cronReconcileSchema = z.object({
  pullAfterMinutes: z.coerce.number().int().min(1).max(1440).default(3),
  expireAfterMinutes: z.coerce.number().int().min(5).max(10080).default(60),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  // Optional run timestamp (matches maintenance/cron/purge) — bounds replay of
  // a captured signed request to a narrow window.
  runAtIso: z.string().min(1).optional()
});

/**
 * Canonical, key-sorted JSON so the worker and the API compute the exact same
 * HMAC input regardless of property order. Mirrors maintenance-cron.controller.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Payment reconciliation cron (ADR-017 safety net).
 *
 * Same trust model as maintenance/cron/purge: an unauthenticated endpoint gated
 * by an HMAC-SHA256 signature over a stable rendering of the body, keyed with
 * API_MAINTENANCE_CRON_SECRET, plus an optional runAtIso skew check. The
 * scheduled Cloudflare worker signs and calls this on a fixed cadence.
 */
@Controller("payments/cron")
export class PaymentReconciliationController {
  constructor(private readonly reconciliation: PaymentReconciliationService) {}

  @Post("reconcile")
  async reconcile(
    @Body() body: unknown,
    @Headers("x-maintenance-cron-signature") signature?: string
  ) {
    if (!signature) {
      throw new BadRequestException("Signature cron manquante.");
    }

    const parsed = cronReconcileSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const expected = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
      .update(stableStringify(body ?? {}))
      .digest("hex");
    const sigBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new BadRequestException("Signature cron invalide.");
    }

    const input = parsed.data;
    const runAt = input.runAtIso ? new Date(input.runAtIso) : new Date();
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException("runAtIso invalide.");
    }
    const skewMs = Math.abs(Date.now() - runAt.getTime());
    if (skewMs > env.API_MAINTENANCE_CRON_MAX_SKEW_SECONDS * 1000) {
      throw new BadRequestException("runAtIso hors fenêtre autorisée.");
    }

    return this.reconciliation.reconcilePending({
      pullAfterMinutes: input.pullAfterMinutes,
      expireAfterMinutes: input.expireAfterMinutes,
      limit: input.limit
    });
  }
}
