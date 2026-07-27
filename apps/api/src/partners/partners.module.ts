import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AlertsModule } from "../alerts/alerts.module";
import { MailModule } from "../mail/mail.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { PartnersController } from "./partners.controller";
import { PartnerNotificationsService } from "./partner-notifications.service";
import { PartnersService } from "./partners.service";

@Module({
  imports: [AuthModule, NotificationsCoreModule, MailModule, AlertsModule],
  controllers: [PartnersController],
  providers: [PartnersService, PartnerNotificationsService],
  exports: [PartnersService]
})
export class PartnersModule {}
