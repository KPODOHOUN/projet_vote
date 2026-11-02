import { BadRequestException, Body, Controller, Headers, Post } from "@nestjs/common";
import { z } from "zod";
import { CRON_ROUTES, CRON_SIGNATURE_HEADER, assertSignedCronRequest } from "../common/cron-signature";
import { EventSettlementService } from "./event-settlement.service";

const cronLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  runAtIso: z.string().min(1)
});

/** Clôture automatique et libération des réserves, appelées par le worker cron (requêtes signées). */
@Controller("offers/cron")
export class OffersCronController {
  constructor(private readonly settlement: EventSettlementService) {}

  @Post("close-expired")
  async closeExpired(@Body() body: unknown, @Headers(CRON_SIGNATURE_HEADER) signature?: string) {
    assertSignedCronRequest(CRON_ROUTES.closeExpired, body, signature);
    return this.settlement.closeExpiredEvents(parseLimit(body));
  }

  @Post("release-held")
  async releaseHeld(@Body() body: unknown, @Headers(CRON_SIGNATURE_HEADER) signature?: string) {
    assertSignedCronRequest(CRON_ROUTES.releaseHeld, body, signature);
    return this.settlement.releaseMaturedHeld(parseLimit(body));
  }
}

function parseLimit(body: unknown): number {
  const parsed = cronLimitSchema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
  return parsed.data.limit;
}
