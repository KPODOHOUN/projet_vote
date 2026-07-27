import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UploadsController, UploadFilesController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController, UploadFilesController],
  providers: [UploadsService]
})
export class UploadsModule {}
