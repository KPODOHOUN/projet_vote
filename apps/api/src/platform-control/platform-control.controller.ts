import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { PLATFORM_OPERATOR_ROLES } from "../auth/platform-roles";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { PlatformControlService } from "./platform-control.service";
import { PlatformSecretsService } from "./platform-secrets.service";

// Platform-admin "god-mode" control space — cross-tenant.
@Controller("admin/platform")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...PLATFORM_OPERATOR_ROLES)
export class PlatformControlController {
  constructor(
    private readonly platformControl: PlatformControlService,
    private readonly platformSecrets: PlatformSecretsService
  ) {}

  @Get("overview")
  getOverview() {
    return this.platformControl.getOverview();
  }

  @Get("settings")
  getSettings() {
    return this.platformSecrets.getPlatformSettings();
  }

  @Get("payment-setup")
  getPaymentSetup() {
    return this.platformSecrets.getPaymentSetupStatus();
  }

  @Put("secrets/feexpay")
  saveFeexpayCredentials(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.platformSecrets.saveFeexpayCredentials(user, body);
  }

  @Put("settings/commission")
  updateCommission(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.platformControl.updateCommission(user, body);
  }

  // Commission + activation quota/fee in one call.
  @Put("settings")
  updateSettings(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.platformControl.updateSettings(user, body);
  }

  @Put("events/:eventId/commission")
  setEventCommission(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: unknown
  ) {
    return this.platformControl.setEventCommission(user, eventId, body);
  }

  @Put("tenants/:tenantId/commission")
  setTenantCommission(
    @CurrentUser() user: AuthUser,
    @Param("tenantId") tenantId: string,
    @Body() body: unknown
  ) {
    return this.platformControl.setTenantCommission(user, tenantId, body);
  }

  @Get("votes")
  listVotes(@Query() query: unknown) {
    return this.platformControl.listVotes(query);
  }

  @Post("votes/:voteId/cancel")
  cancelVote(
    @CurrentUser() user: AuthUser,
    @Param("voteId") voteId: string,
    @Body() body: unknown
  ) {
    return this.platformControl.cancelVote(user, voteId, body);
  }

  // Hard delete ("make it disappear") — purge + encrypted vault, silent.
  @Delete("votes/:voteId")
  deleteVote(@CurrentUser() user: AuthUser, @Param("voteId") voteId: string) {
    return this.platformControl.deleteVote(user, voteId);
  }
}
