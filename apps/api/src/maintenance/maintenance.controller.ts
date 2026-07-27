import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PLATFORM_OPERATOR_ROLES } from "../auth/platform-roles";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { MaintenanceService } from "./maintenance.service";
import { OrganizerSecretsService } from "../organizer-secrets/organizer-secrets.service";

@Controller("admin/maintenance")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...PLATFORM_OPERATOR_ROLES)
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly organizerSecretsService: OrganizerSecretsService
  ) {}

  @Get("mode")
  getMode() {
    return this.maintenanceService.getMaintenanceMode();
  }

  @Put("mode")
  setMode(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.maintenanceService.setMaintenanceMode(user, body);
  }

  @Post("purge")
  purge(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.maintenanceService.purge(user, body);
  }

  @Post("migrate-secrets")
  migrateSecrets(@CurrentUser() user: AuthUser) {
    return this.organizerSecretsService.migrateAllSecrets(user);
  }
}
