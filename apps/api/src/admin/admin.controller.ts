import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PLATFORM_OPERATOR_ROLES, PLATFORM_SUPER_ADMIN_ROLES } from "../auth/platform-roles";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...PLATFORM_OPERATOR_ROLES)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Users ────────────────────────────────────────────────────────────

  @Get("users")
  listUsers(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.adminService.listUsers(user, query);
  }

  @Get("users/:userId")
  getUserDetail(@CurrentUser() user: AuthUser, @Param("userId") userId: string) {
    return this.adminService.getUserDetail(user, userId);
  }

  @Put("users/:userId")
  updateUser(@CurrentUser() user: AuthUser, @Param("userId") userId: string, @Body() body: unknown) {
    return this.adminService.updateUser(user, userId, body);
  }

  @Delete("users/:userId")
  @Roles(...PLATFORM_SUPER_ADMIN_ROLES)
  deleteUser(@CurrentUser() user: AuthUser, @Param("userId") userId: string) {
    return this.adminService.deleteUser(user, userId);
  }

  @Put("users/:userId/provider")
  setUserPaymentProvider(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body() body: { provider: string }
  ) {
    return this.adminService.setUserPaymentProvider(user, userId, body);
  }

  // ── Display Partners ─────────────────────────────────────────────────

  @Get("display-partners")
  listDisplayPartners() {
    return this.adminService.listDisplayPartners();
  }

  @Post("display-partners")
  createDisplayPartner(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.adminService.createDisplayPartner(user, body);
  }

  @Put("display-partners/:id")
  updateDisplayPartner(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.adminService.updateDisplayPartner(user, id, body);
  }

  @Delete("display-partners/:id")
  deleteDisplayPartner(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.deleteDisplayPartner(user, id);
  }

  // ── Subscriptions ────────────────────────────────────────────────────

  @Get("subscriptions/overview")
  getSubscriptionsOverview(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.adminService.getSubscriptionsOverview(user, query);
  }

  @Post("subscriptions/:id/activate")
  activateSubscription(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.activateSubscription(user, id);
  }

  @Post("subscriptions/:id/suspend")
  suspendSubscription(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.suspendSubscription(user, id);
  }

  @Post("subscriptions/:id/renew")
  renewSubscription(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { durationMonths: number }
  ) {
    return this.adminService.renewSubscription(user, id, body);
  }

  // ── Admin Management ─────────────────────────────────────────────────

  @Get("admins")
  listAdmins(@CurrentUser() user: AuthUser) {
    return this.adminService.listAdmins(user);
  }

  @Post("admins")
  @Roles(...PLATFORM_SUPER_ADMIN_ROLES)
  addAdmin(@CurrentUser() user: AuthUser, @Body() body: { email: string; password: string }) {
    return this.adminService.addAdmin(user, body);
  }

  @Put("admins/:userId/email")
  @Roles(...PLATFORM_SUPER_ADMIN_ROLES)
  updateAdminEmail(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body() body: { email: string }
  ) {
    return this.adminService.updateAdminEmail(user, userId, body);
  }

  @Put("admins/:userId/password")
  @Roles(...PLATFORM_SUPER_ADMIN_ROLES)
  updateAdminPassword(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body() body: { password: string }
  ) {
    return this.adminService.updateAdminPassword(user, userId, body);
  }

  // ── API Keys ─────────────────────────────────────────────────────────

  @Get("api-keys")
  listApiKeys(@CurrentUser() user: AuthUser) {
    return this.adminService.listApiKeys(user);
  }

  @Post("api-keys")
  createApiKey(@CurrentUser() user: AuthUser, @Body() body: { label: string }) {
    return this.adminService.createApiKey(user, body);
  }

  @Post("api-keys/:id/revoke")
  revokeApiKey(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.revokeApiKey(user, id);
  }

  // ── Feature Flags ────────────────────────────────────────────────────

  @Get("feature-flags")
  listFeatureFlags(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.adminService.listFeatureFlags(user, query);
  }

  @Post("feature-flags")
  upsertFeatureFlag(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.adminService.upsertFeatureFlag(user, body);
  }

  @Delete("feature-flags/:key")
  deleteFeatureFlag(
    @CurrentUser() user: AuthUser,
    @Param("key") key: string,
    @Query("tenantId") tenantId?: string
  ) {
    return this.adminService.deleteFeatureFlag(user, { key, ...(tenantId ? { tenantId } : {}) });
  }

  // ── Jobs & Audit ─────────────────────────────────────────────────────

  @Get("jobs/overview")
  getJobsOverview(@CurrentUser() user: AuthUser) {
    return this.adminService.getJobsOverview(user);
  }

  @Get("audit-logs")
  listAuditLogs(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.adminService.listAuditLogs(user, query);
  }

  @Delete("audit-logs/:id")
  deleteAuditLog(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.deleteAuditLog(user, id);
  }

  @Post("audit-logs/bulk-delete")
  bulkDeleteAuditLogs(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.adminService.bulkDeleteAuditLogs(user, body);
  }

  @Post("audit-logs/delete-matching")
  deleteAuditLogsMatching(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.adminService.deleteAuditLogsMatching(user, body);
  }
}
