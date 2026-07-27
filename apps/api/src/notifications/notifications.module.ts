import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsCoreModule } from "./notifications-core.module";

@Module({
  imports: [AuthModule, NotificationsCoreModule],
  controllers: [NotificationsController]
})
export class NotificationsModule {}
