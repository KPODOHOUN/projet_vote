import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "../auth/auth.module";
import { PaymentsModule } from "../payments/payments.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { PayoutBalanceService } from "./payout-balance.service";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";
import { PayoutsService } from "./payouts.service";
import { PayoutSchedulerService } from "./payout-scheduler.service";
import { PayoutsController, PayoutDestinationController } from "./payouts.controller";

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, PaymentsModule, NotificationsCoreModule],
  controllers: [PayoutsController, PayoutDestinationController],
  providers: [
    PayoutBalanceService,
    PayoutJobLockService,
    PayoutDestinationService,
    PayoutsService,
    PayoutSchedulerService
  ],
  exports: [PayoutsService, PayoutBalanceService, PayoutDestinationService]
})
export class PayoutsModule {}
