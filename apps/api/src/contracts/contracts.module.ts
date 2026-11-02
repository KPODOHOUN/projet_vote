import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { OffersModule } from "../offers/offers.module";
import { AdminContractsController, ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";

@Module({
  imports: [AuthModule, MailModule, OffersModule, NotificationsCoreModule],
  controllers: [ContractsController, AdminContractsController],
  providers: [ContractsService]
})
export class ContractsModule {}
