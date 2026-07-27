import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizerSecretsModule } from "../organizer-secrets/organizer-secrets.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PlansModule } from "./plans/plans.module";

@Module({
  imports: [AuthModule, OrganizerSecretsModule, PlansModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule { }
