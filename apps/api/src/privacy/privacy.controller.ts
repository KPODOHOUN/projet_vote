import { Controller, Delete, Get, Header, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CURRENT_PRIVACY_POLICY_VERSION } from "./privacy-policy";
import { PrivacyService } from "./privacy.service";

@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  // PUBLIC : version courante de la politique. Servie pour que la page
  // d'inscription organisateur puisse afficher/comparer la version acceptée.
  @Get("policy")
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  getPolicyVersion() {
    return { version: CURRENT_PRIVACY_POLICY_VERSION };
  }

  // AUTHENTIFIÉ : exports / RGPD existants (inchangés).
  @Get("export")
  @Header("Content-Type", "application/zip")
  @UseGuards(AuthGuard)
  async exportUserData(@CurrentUser() user: AuthUser, @Res() response: Response) {
    const archive = await this.privacyService.buildUserExportArchive(user);
    const datePart = new Date().toISOString().slice(0, 10);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="shadowa-votes-export-${datePart}.zip"`
    );
    response.send(archive);
  }

  @Delete("delete")
  @UseGuards(AuthGuard)
  deleteUserData(@CurrentUser() user: AuthUser) {
    return this.privacyService.anonymizeUserData(user);
  }
}
