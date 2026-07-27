import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizerSecretsModule } from "../organizer-secrets/organizer-secrets.module";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceCronController } from "./maintenance-cron.controller";
import { MaintenancePublicController } from "./maintenance-public.controller";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [AuthModule, OrganizerSecretsModule],
  controllers: [MaintenanceController, MaintenanceCronController, MaintenancePublicController],
  providers: [MaintenanceService]
})
export class MaintenanceModule {}
