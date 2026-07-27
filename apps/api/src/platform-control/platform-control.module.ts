import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformControlController } from "./platform-control.controller";
import { PlatformControlService } from "./platform-control.service";
import { PlatformSecretsService } from "./platform-secrets.service";
import { VaultController } from "./vault.controller";
import { VaultOtpGuard } from "./vault-otp.guard";
import { VaultOtpService } from "./vault-otp.service";
import { VaultService } from "./vault.service";

@Module({
  imports: [AuthModule],
  controllers: [PlatformControlController, VaultController],
  providers: [PlatformControlService, PlatformSecretsService, VaultService, VaultOtpService, VaultOtpGuard],
  exports: [PlatformControlService, PlatformSecretsService, VaultService]
})
export class PlatformControlModule {}
