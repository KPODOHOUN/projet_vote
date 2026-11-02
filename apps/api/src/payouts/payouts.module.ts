import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { PayoutJobLockService } from "./payout-job-lock.service";
import { PayoutDestinationService } from "./payout-destination.service";
import { PayoutDestinationController } from "./payout-destination.controller";

/** Numéro de retrait de l'organisateur + verrou des traitements financiers périodiques. */
@Module({
  imports: [AuthModule, MailModule, NotificationsCoreModule],
  controllers: [PayoutDestinationController],
  providers: [PayoutJobLockService, PayoutDestinationService],
  exports: [PayoutJobLockService, PayoutDestinationService]
})
export class PayoutsModule {}
