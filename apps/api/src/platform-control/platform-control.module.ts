import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlController } from "./platform-control.controller";
import { PlatformControlService } from "./platform-control.service";
import { PlatformSecretsService } from "./platform-secrets.service";
import { VaultController } from "./vault.controller";
import { VaultOtpGuard } from "./vault-otp.guard";
import { VaultOtpService } from "./vault-otp.service";
import { VaultService } from "./vault.service";
import { WalletService } from "../offers/wallet.service";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [AuthModule, MailModule],
  controllers: [PlatformControlController, VaultController],
  providers: [PlatformControlService, PlatformSecretsService, VaultService, VaultOtpService, VaultOtpGuard, WalletService],
  exports: [PlatformControlService, PlatformSecretsService, VaultService]
})
export class PlatformControlModule {}
