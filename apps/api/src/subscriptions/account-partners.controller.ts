import { Body, Controller, Get, Param, Post, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { AccountPartnersService } from './account-partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_OPERATOR_ROLES } from '../auth/platform-roles';

@Controller('account-partners')
@UseGuards(AuthGuard, RolesGuard)
export class AccountPartnersController {
  constructor(
    private readonly accountPartners: AccountPartnersService,
    private readonly prisma: PrismaService
  ) {}

  @Post('request')
  @Roles(UserRole.ORGANIZER_OWNER)
  requestPartnership(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.accountPartners.requestAccountPartnership(user, body);
  }

  @Get('my-requests')
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  getMyRequests(@CurrentUser() user: AuthUser) {
    return this.accountPartners.getMyPartnerRequests(user);
  }

  @Get('contract-preview')
  @Roles(UserRole.ORGANIZER_OWNER)
  async getContractPreview(@CurrentUser() user: AuthUser) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, displayName: true, slug: true }
    });
    if (!tenant) {
      throw new NotFoundException("Organisateur introuvable.");
    }
    return this.accountPartners.getContractTemplate(tenant);
  }

  @Get('contract/:id')
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF, ...PLATFORM_OPERATOR_ROLES)
  getContract(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accountPartners.getContract(user, id);
  }

  @Get('admin/pending')
  @Roles(...PLATFORM_OPERATOR_ROLES)
  listPending(@CurrentUser() user: AuthUser) {
    return this.accountPartners.listPendingRequests(user);
  }

  @Get('admin/pending-count')
  @Roles(...PLATFORM_OPERATOR_ROLES)
  async pendingCount() {
    const count = await this.accountPartners.countPendingRequests();
    return { count };
  }

  @Get('admin/requests')
  @Roles(...PLATFORM_OPERATOR_ROLES)
  listRequests(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.accountPartners.listAllRequests(user, query);
  }

  @Post('admin/:id/approve')
  @Roles(...PLATFORM_OPERATOR_ROLES)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    return this.accountPartners.approvePartnership(user, id, body);
  }

  @Post('admin/:id/reject')
  @Roles(...PLATFORM_OPERATOR_ROLES)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    return this.accountPartners.rejectPartnership(user, id, body);
  }
}

