import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsCoreModule } from '../notifications/notifications-core.module';
import { MailModule } from '../mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlansModule } from '../admin/plans/plans.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { AccountPartnersService } from './account-partners.service';
import { AccountPartnersController } from './account-partners.controller';
import { PlansPublicController } from './plans-public.controller';

@Module({
  imports: [AuthModule, NotificationsCoreModule, MailModule, PaymentsModule, PlansModule],
  controllers: [SubscriptionsController, AccountPartnersController, PlansPublicController],
  providers: [SubscriptionsService, AccountPartnersService],
  exports: [SubscriptionsService]
})
export class SubscriptionsModule { }
