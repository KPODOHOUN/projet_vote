import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizerSecretsController } from "./organizer-secrets.controller";
import { OrganizerSecretsService } from "./organizer-secrets.service";

@Module({
  imports: [AuthModule],
  controllers: [OrganizerSecretsController],
  providers: [OrganizerSecretsService],
  exports: [OrganizerSecretsService]
})
export class OrganizerSecretsModule {}
