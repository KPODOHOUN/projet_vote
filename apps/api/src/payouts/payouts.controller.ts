import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { PayoutsService } from "./payouts.service";
import { PayoutDestinationService } from "./payout-destination.service";

/**
 * Payout administration (god-mode). Every disbursement action is platform-admin
 * only. Organizer-facing destination config lives on a separate route guarded to
 * the organizer's own tenant.
 */
@Controller("admin/platform/payouts")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post("periods")
  openPeriod(@Body() body: unknown) {
    return this.payouts.openPeriod(body);
  }

  @Post("periods/:id/process")
  processPeriod(@Param("id") id: string) {
    return this.payouts.processPeriod(id);
  }

  @Get("periods/:id")
  getPeriod(@Param("id") id: string) {
    return this.payouts.getPeriod(id);
  }

  @Get()
  listPayouts(@Query() query: unknown) {
    return this.payouts.listPayouts(query);
  }

  @Post(":id/resolve")
  resolveUncertain(@Param("id") id: string, @Body() body: unknown) {
    return this.payouts.resolveUncertain(id, body);
  }
}

/**
 * Organizer settlement destination. Scoped to the caller's own tenant — an
 * organizer can only set where THEY get paid. Owners (and staff) of a tenant.
 */
@Controller("organizer/payout-destination")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER_OWNER)
export class PayoutDestinationController {
  constructor(private readonly destinations: PayoutDestinationService) {}

  @Post()
  setDestination(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.destinations.setForTenant(user.tenantId, body);
  }
}
