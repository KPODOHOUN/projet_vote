import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UploadsService, type UploadedImageFile } from "./uploads.service";

const UPLOAD_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF] as const;

@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("signature")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...UPLOAD_ROLES)
  signature() {
    return this.uploadsService.signUpload();
  }

  @Post("image")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...UPLOAD_ROLES)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadImage(@UploadedFile() file: UploadedImageFile | undefined) {
    return this.uploadsService.storeDirectUpload(file);
  }
}

@Controller("uploads/files")
export class UploadFilesController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get(":filename")
  async serve(@Param("filename") filename: string, @Res() response: Response) {
    await this.uploadsService.serveLocalFile(filename, response);
  }
}
