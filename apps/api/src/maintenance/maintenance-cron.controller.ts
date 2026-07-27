import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post
} from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../config/env";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { MaintenanceService } from "./maintenance.service";

const cronPurgeSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    tenantSlug: z.string().min(1).optional(),
    auditLogsRetentionDays: z.coerce.number().int().min(7).max(3650).default(365),
    idempotencyRetentionDays: z.coerce.number().int().min(1).max(365).default(30),
    revokedSessionsRetentionDays: z.coerce.number().int().min(1).max(365).default(30),
    // Optional: helps deterministic idempotency across retries when the caller provides a run time.
    runAtIso: z.string().min(1).optional()
  })
  .refine((v) => Boolean(v.tenantId) || Boolean(v.tenantSlug), {
    message: "tenantId ou tenantSlug requis"
  });

type CronPurgeInput = z.infer<typeof cronPurgeSchema>;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

@Controller("maintenance/cron")
export class MaintenanceCronController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenanceService: MaintenanceService
  ) {}

  @Post("purge")
  async purgeScheduled(
    @Body() body: unknown,
    @Headers("x-maintenance-cron-signature") signature?: string
  ) {
    if (!signature) {
      throw new BadRequestException("Signature cron manquante.");
    }

    const parsed = cronPurgeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    // Signature: HMAC-SHA256 sur une représentation stable du body.
    const expected = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
      .update(stableStringify(body))
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new BadRequestException("Signature cron invalide.");
    }

    const input = parsed.data satisfies CronPurgeInput;

    const runAt = input.runAtIso ? new Date(input.runAtIso) : new Date();
    if (Number.isNaN(runAt.getTime())) {
      throw new BadRequestException("runAtIso invalide.");
    }
    const skewMs = Math.abs(Date.now() - runAt.getTime());
    const maxSkewMs = env.API_MAINTENANCE_CRON_MAX_SKEW_SECONDS * 1000;
    if (skewMs > maxSkewMs) {
      throw new BadRequestException("runAtIso hors fenêtre autorisée.");
    }

    const dateKey = runAt.toISOString().slice(0, 10); // YYYY-MM-DD UTC

    const resolvedTenant = input.tenantId
      ? await this.prisma.client.tenant.findUnique({ where: { id: input.tenantId } })
      : input.tenantSlug
        ? await this.prisma.client.tenant.findUnique({ where: { slug: input.tenantSlug } })
        : null;

    if (!resolvedTenant) {
      throw new BadRequestException("Tenant introuvable.");
    }

    const idempotencyKey = `maintenance:cron:purge:${resolvedTenant.id}:${dateKey}:${input.auditLogsRetentionDays}:${input.idempotencyRetentionDays}:${input.revokedSessionsRetentionDays}`;
    const requestHash = createHash("sha256").update(stableStringify(body)).digest("hex");

    const existing = await this.prisma.client.idempotencyKey.findUnique({
      where: { key: idempotencyKey }
    });

    if (existing) {
      return { alreadyExecuted: true, idempotencyKey };
    }

    await this.prisma.client.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        scope: "maintenance:cron:purge",
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    const systemUser: AuthUser = {
      tenantId: resolvedTenant.id,
      userId: "system:maintenance:cron",
      role: UserRole.PLATFORM_ADMIN,
      email: "system:maintenance:cron@votezpro.africa"
    };

    const result = await this.maintenanceService.purge(systemUser, {
      auditLogsRetentionDays: input.auditLogsRetentionDays,
      idempotencyRetentionDays: input.idempotencyRetentionDays,
      revokedSessionsRetentionDays: input.revokedSessionsRetentionDays
    });

    return { ...result, alreadyExecuted: false, idempotencyKey };
  }
}

