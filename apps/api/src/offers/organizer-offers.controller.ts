import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { EventSettlementService } from "./event-settlement.service";
import { EventStatsService } from "./event-stats.service";
import { OrganizerOffersService } from "./organizer-offers.service";
import { WalletService } from "./wallet.service";
import { WithdrawalsService } from "./withdrawals.service";

const ORGANIZER_ROLES = [
  UserRole.ORGANIZER_OWNER,
  UserRole.ORGANIZER_STAFF,
  UserRole.PLATFORM_ADMIN
] as const;

const OWNER_ROLES = [UserRole.ORGANIZER_OWNER, UserRole.PLATFORM_ADMIN] as const;

@Controller("organizer")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ORGANIZER_ROLES)
export class OrganizerOffersController {
  constructor(
    private readonly offers: OrganizerOffersService,
    private readonly wallet: WalletService,
    private readonly withdrawals: WithdrawalsService,
    private readonly eventStats: EventStatsService,
    private readonly settlement: EventSettlementService
  ) {}

  @Get("offer")
  getOffer(@CurrentUser() user: AuthUser) {
    return this.offers.getOffer(user);
  }

  @Post("offer/switch")
  @Roles(...OWNER_ROLES)
  switchOffer(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.offers.switchOffer(user, body);
  }

  @Post("offer/fedapay-subaccount")
  @Roles(...OWNER_ROLES)
  submitFedaPaySubAccount(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.offers.submitFedaPaySubAccount(user, body);
  }

  @Get("wallet")
  getWallet(@CurrentUser() user: AuthUser) {
    return this.wallet.getWallet(user.tenantId);
  }

  @Post("withdrawals")
  @Roles(...OWNER_ROLES)
  requestWithdrawal(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.withdrawals.requestWithdrawal(user, body);
  }

  @Get("withdrawals")
  listWithdrawals(@CurrentUser() user: AuthUser) {
    return this.withdrawals.listForOrganizer(user.tenantId);
  }

  @Get("events/:eventId/stats")
  eventStatsRoute(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventStats.getEventStats(eventId, user.tenantId);
  }

  @Post("events/:eventId/close")
  @Roles(...OWNER_ROLES)
  closeEvent(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.settlement.closeEvent(user, eventId);
  }

  @Get("events/:eventId/topup-quote")
  topupQuote(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Query("votesCount") votesCount: string
  ) {
    return this.offers.topupQuote(user, eventId, votesCount);
  }
}
