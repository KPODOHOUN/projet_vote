import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Headers, BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('cron/process')
  async runCron(
    @Body() body: unknown,
    @Headers('x-maintenance-cron-signature') signature?: string
  ) {
    if (!signature) {
      throw new BadRequestException("Signature cron manquante.");
    }
    const expected = createHmac("sha256", env.API_MAINTENANCE_CRON_SECRET)
      .update(JSON.stringify(body))
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new BadRequestException("Signature cron invalide.");
    }

    const expirations = await this.subscriptionsService.processExpirations();
    const reminders = await this.subscriptionsService.processReminders();

    return { success: true, expirations, reminders };
  }

  @Get('pricing')
  getPricing() {
    return this.subscriptionsService.listPricing();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  @Get('me')
  getMySubscription(@CurrentUser() user: AuthUser) {
    return this.subscriptionsService.getMySubscription(user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER_OWNER)
  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.subscriptionsService.initSubscriptionPayment(user, body);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  @Get('payment-status/:txId')
  getPaymentStatus(@CurrentUser() user: AuthUser, @Param('txId') txId: string) {
    return this.subscriptionsService.getSubscriptionPaymentStatus(user, txId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @Get('admin/list')
  listSubscriptionsAdmin(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.subscriptionsService.listAllSubscriptions(user, query);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @Get('admin/pricing')
  listPricingAdmin() {
    return this.subscriptionsService.listPricingAdmin();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN)
  @Put('admin/pricing')
  updatePricingAdmin(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.subscriptionsService.updatePricing(user, body);
  }
}
