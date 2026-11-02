import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post
} from "@nestjs/common";
import { createHash } from "crypto";
import { z } from "zod";
import { CRON_ROUTES, CRON_SIGNATURE_HEADER, assertSignedCronRequest, stableStringify } from "../common/cron-signature";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { MaintenanceService } from "./maintenance.service";

const cronPurgeSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    tenantSlug: z.string().min(1).optional(),
    auditLogsRetentionDays: z.coerce.number().int().min(30).max(3650).default(365),
    idempotencyRetentionDays: z.coerce.number().int().min(1).max(365).default(30),
    revokedSessionsRetentionDays: z.coerce.number().int().min(1).max(365).default(30),
    runAtIso: z.string().min(1)
  })
  .refine((v) => Boolean(v.tenantId) || Boolean(v.tenantSlug), {
    message: "tenantId ou tenantSlug requis"
  });

type CronPurgeInput = z.infer<typeof cronPurgeSchema>;

@Controller("maintenance/cron")
export class MaintenanceCronController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenanceService: MaintenanceService
  ) {}

  @Post("purge")
  async purgeScheduled(
    @Body() body: unknown,
    @Headers(CRON_SIGNATURE_HEADER) signature?: string
  ) {
    const runAt = assertSignedCronRequest(CRON_ROUTES.purge, body, signature);

    const parsed = cronPurgeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data satisfies CronPurgeInput;

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

