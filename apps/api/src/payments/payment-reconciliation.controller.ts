import { BadRequestException, Body, Controller, Headers, Post } from "@nestjs/common";
import { z } from "zod";
import { CRON_ROUTES, CRON_SIGNATURE_HEADER, assertSignedCronRequest } from "../common/cron-signature";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const cronReconcileSchema = z.object({
  pullAfterMinutes: z.coerce.number().int().min(1).max(1440).default(3),
  expireAfterMinutes: z.coerce.number().int().min(5).max(10080).default(60),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  runAtIso: z.string().min(1)
});

/**
 * Payment reconciliation cron (ADR-017 safety net). Endpoint non authentifié,
 * protégé par la signature cron (voir common/cron-signature.ts) ; le worker
 * Cloudflare l'appelle à cadence fixe.
 */
@Controller("payments/cron")
export class PaymentReconciliationController {
  constructor(private readonly reconciliation: PaymentReconciliationService) {}

  @Post("reconcile")
  async reconcile(@Body() body: unknown, @Headers(CRON_SIGNATURE_HEADER) signature?: string) {
    assertSignedCronRequest(CRON_ROUTES.reconcile, body, signature);
    const parsed = cronReconcileSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.reconciliation.reconcilePending({
      pullAfterMinutes: parsed.data.pullAfterMinutes,
      expireAfterMinutes: parsed.data.expireAfterMinutes,
      limit: parsed.data.limit
    });
  }
}
