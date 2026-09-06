import { BadRequestException, Body, Controller, Headers, Post } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../config/env";
import { EventSettlementService } from "./event-settlement.service";

const closeExpiredSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  runAtIso: z.string().min(1)
});

const releaseHeldSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  runAtIso: z.string().min(1)
});

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

@Controller("offers/cron")
export class OffersCronController {
  constructor(private readonly settlement: EventSettlementService) {}

  @Post("close-expired")
  async closeExpired(
    @Body() body: unknown,
    @Headers("x-maintenance-cron-signature") signature?: string
  ) {
    if (!signature) throw new BadRequestException("Signature cron manquante.");

    const parsed = closeExpiredSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const expected = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
      .update(stableStringify(body ?? {}))
      .digest("hex");
    const received = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    ) {
      throw new BadRequestException("Signature cron invalide.");
    }

    const runAt = new Date(parsed.data.runAtIso);
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException("runAtIso invalide.");
    }
    if (
      Math.abs(Date.now() - runAt.getTime()) >
      env.API_MAINTENANCE_CRON_MAX_SKEW_SECONDS * 1000
    ) {
      throw new BadRequestException("runAtIso hors fenêtre autorisée.");
    }

    return this.settlement.closeExpiredEvents(parsed.data.limit);
  }

  @Post("release-held")
  async releaseHeld(
    @Body() body: unknown,
    @Headers("x-maintenance-cron-signature") signature?: string
  ) {
    if (!signature) throw new BadRequestException("Signature cron manquante.");

    const parsed = releaseHeldSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const expected = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
      .update(stableStringify(body ?? {}))
      .digest("hex");
    const received = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    ) {
      throw new BadRequestException("Signature cron invalide.");
    }

    const runAt = new Date(parsed.data.runAtIso);
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException("runAtIso invalide.");
    }
    if (
      Math.abs(Date.now() - runAt.getTime()) >
      env.API_MAINTENANCE_CRON_MAX_SKEW_SECONDS * 1000
    ) {
      throw new BadRequestException("runAtIso hors fenêtre autorisée.");
    }

    return this.settlement.releaseMaturedHeld(parsed.data.limit);
  }
}
