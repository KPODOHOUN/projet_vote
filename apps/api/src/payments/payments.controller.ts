import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Throttle } from "@nestjs/throttler";
import { Observable, interval, map, switchMap, takeWhile } from "rxjs";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("init")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  initPayment(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.paymentsService.initPayment(user, body);
  }

  @Post("public/init")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  initPublicPayment(@Body() body: unknown) {
    return this.paymentsService.initPublicPayment(body);
  }

  @Get("activation/fee")
  getActivationFeeInfo() {
    return this.paymentsService.getActivationFeeInfo();
  }

  @Post("activation/init")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  initActivationPayment(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.paymentsService.initActivationPayment(user, body);
  }

  @Get(":transactionId/status")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  getOrganizerPaymentStatus(@CurrentUser() user: AuthUser, @Param("transactionId") transactionId: string) {
    return this.paymentsService.getOrganizerPaymentStatus(user, transactionId);
  }

  @Post("public/status")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  getPublicPaymentStatus(@Body() body: unknown) {
    return this.paymentsService.getPublicPaymentStatus(body);
  }

  @Sse("public/status/stream")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  publicPaymentStatusStream(
    @Query("tenantSlug") tenantSlug: string,
    @Query("eventSlug") eventSlug: string,
    @Query("transactionId") transactionId: string,
    // Opaque capability token (no PII). Kept out of the request body because
    // EventSource cannot send one; unlike the voter phone it is safe to appear
    // in access logs — it reveals nothing about the voter.
    @Query("statusToken") statusToken: string
  ): Observable<MessageEvent> {
    return interval(3_000).pipe(
      switchMap(async () =>
        this.paymentsService.getPublicPaymentStatus({
          tenantSlug,
          eventSlug,
          transactionId,
          statusToken
        })
      ),
      takeWhile((statusSnapshot) => statusSnapshot.status !== "SUCCEEDED" && statusSnapshot.status !== "FAILED", true),
      map((statusSnapshot) => ({ data: statusSnapshot }))
    );
  }

  /**
   * Feexpay webhook (ADR-017).
   *
   * IMPORTANT: this endpoint is intentionally unauthenticated and does NOT
   * verify any signature — Feexpay's webhook system does not sign payloads.
   * The endpoint extracts a `reference` and delegates to the verify-by-pull
   * pipeline, which authenticates against Feexpay server-to-server with our
   * API key. A forged webhook for an unknown reference is rejected with an
   * audit trail; a forged webhook for a real reference triggers a real
   * verification call to Feexpay, whose answer (not the webhook body) drives
   * the database mutation.
   *
   * We always respond 200/acknowledged so Feexpay does not keep retrying a
   * malformed payload. The throttler caps abusive callers.
   */
  @Post("webhooks/feexpay")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async feexPayWebhook(@Body() body: unknown) {
    return this.paymentsService.processWebhook(body);
  }
}
