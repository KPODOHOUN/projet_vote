import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PLATFORM_OPERATOR_ROLES } from "../auth/platform-roles";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CommissionOverrideService } from "./commission-override.service";
import { EventSettlementService } from "./event-settlement.service";
import { EventStatsService } from "./event-stats.service";
import { OfferSettingsService } from "./offer-settings.service";
import { OrganizerOffersService } from "./organizer-offers.service";
import { WithdrawalsService } from "./withdrawals.service";

@Controller("admin/offers")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...PLATFORM_OPERATOR_ROLES)
export class AdminOffersController {
  constructor(
    private readonly offerSettings: OfferSettingsService,
    private readonly withdrawals: WithdrawalsService,
    private readonly eventStats: EventStatsService,
    private readonly organizerOffers: OrganizerOffersService,
    private readonly settlement: EventSettlementService,
    private readonly commissionOverride: CommissionOverrideService
  ) {}

  @Get("settings")
  getSettings() {
    return this.offerSettings.getSettings();
  }

  @Put("settings")
  updateSettings(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.offerSettings.updateSettings(user, body);
  }

  @Get("revenue")
  revenue() {
    return this.organizerOffers.adminRevenueByOfferType();
  }

  @Get("fedapay-subaccounts")
  listFedaPaySubAccounts() {
    return this.organizerOffers.listFedaPaySubAccounts();
  }

  @Post("fedapay-subaccounts/:tenantId/verify")
  verifyFedaPaySubAccount(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string
  ) {
    return this.organizerOffers.verifyFedaPaySubAccount(user, tenantId);
  }

  @Get("withdrawals")
  listWithdrawals(@Query() query: Record<string, unknown>) {
    return this.withdrawals.listAll(query);
  }

  @Post("withdrawals/:id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.withdrawals.approve(user, id);
  }

  @Post("withdrawals/:id/reject")
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.withdrawals.reject(user, id, body);
  }

  @Post("withdrawals/:id/mark-paid")
  markPaid(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.withdrawals.markPaid(user, id);
  }

  @Get("events/active")
  activeEvents() {
    return this.eventStats.listActiveEventsWithStats();
  }

  @Post("events/close-expired")
  closeExpired(@CurrentUser() _user: AuthUser) {
    return this.settlement.closeExpiredEvents();
  }

  @Get("events/:eventId")
  eventDetail(@Param("eventId") eventId: string) {
    return this.eventStats.getEventStats(eventId);
  }

  @Get("events/:eventId/commission")
  getEventCommission(@Param("eventId") eventId: string) {
    return this.offerSettings.describeEscrowCommission(eventId);
  }

  @Put("events/:eventId/commission")
  setEventCommission(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: { commissionBps: number }
  ) {
    return this.commissionOverride.setEventCommission(user, eventId, body.commissionBps);
  }

  @Put("tenants/:tenantId/commission")
  setTenantCommission(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() body: { commissionBps: number }
  ) {
    return this.commissionOverride.setTenantCommission(user, tenantId, body.commissionBps);
  }
}
