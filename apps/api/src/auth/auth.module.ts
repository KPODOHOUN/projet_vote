import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MailModule } from "../mail/mail.module";
import { NotificationsCoreModule } from "../notifications/notifications-core.module";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./roles.guard";
import { OAuthModule } from "./oauth/oauth.module";

@Module({
  imports: [NotificationsCoreModule, MailModule, OAuthModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, Reflector],
  exports: [AuthService, AuthGuard, RolesGuard]
})
export class AuthModule {}
