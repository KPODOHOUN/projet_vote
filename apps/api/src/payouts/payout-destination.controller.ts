import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { PayoutDestinationService } from "./payout-destination.service";

/**
 * Numéro Mobile Money de retrait de l'organisateur. Limité à son propre
 * espace : un organisateur ne règle que l'endroit où LUI est payé.
 */
@Controller("organizer/payout-destination")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER_OWNER)
export class PayoutDestinationController {
  constructor(private readonly destinations: PayoutDestinationService) {}

  @Get()
  getDestination(@CurrentUser() user: AuthUser) {
    return this.destinations.getSummaryForTenant(user.tenantId);
  }

  @Post()
  setDestination(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.destinations.setForTenant(user.tenantId, body);
  }
}
