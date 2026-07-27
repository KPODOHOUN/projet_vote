import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { PartnersService } from "./partners.service";

@Controller("partners")
@UseGuards(AuthGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get("offer-tiers")
  @Roles(
    UserRole.ORGANIZER_OWNER,
    UserRole.ORGANIZER_STAFF,
    UserRole.PLATFORM_ADMIN,
    UserRole.PLATFORM_SUPER_ADMIN
  )
  listOfferTiers(@CurrentUser() user: AuthUser) {
    const activeOnly =
      user.role !== UserRole.PLATFORM_ADMIN && user.role !== UserRole.PLATFORM_SUPER_ADMIN;
    return this.partners.listOfferTiers(activeOnly);
  }

  @Post("requests")
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  requestPartnership(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.partners.requestPartnership(user, body);
  }

  @Get("events/:eventId/status")
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF, UserRole.PLATFORM_ADMIN)
  getEventPartnerStatus(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.partners.getEventPartnerStatus(user, eventId);
  }

  @Get("admin/offer-tiers")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  listAdminOfferTiers() {
    return this.partners.listOfferTiers(false);
  }

  @Post("admin/offer-tiers")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  createOfferTier(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.partners.createOfferTier(user, body);
  }

  @Put("admin/offer-tiers/:id")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  updateOfferTier(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.partners.updateOfferTier(user, id, body);
  }

  @Delete("admin/offer-tiers/:id")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  deleteOfferTier(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.partners.deleteOfferTier(user, id);
  }

  @Get("admin/events/financials")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  listPartnerEventsFinancials() {
    return this.partners.listPartnerEventsFinancials();
  }

  @Get("admin/events/:eventId/financials")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  getPartnerEventFinancials(@Param("eventId") eventId: string) {
    return this.partners.getPartnerEventFinancials(eventId);
  }

  @Get("admin/requests/pending-count")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  async pendingRequestCount() {
    const count = await this.partners.countPendingRequests();
    return { count };
  }

  @Get("admin/requests")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  listRequests(@Query() query: unknown) {
    return this.partners.listRequests(query);
  }

  @Post("admin/requests/:id/approve")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  approveRequest(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.partners.approveRequest(user, id, body);
  }

  @Post("admin/requests/:id/reject")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  rejectRequest(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.partners.rejectRequest(user, id, body);
  }

  @Get("admin/debts")
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  listDebts(@Query("tenantId") tenantId?: string) {
    return this.partners.listDebts(tenantId);
  }
}
