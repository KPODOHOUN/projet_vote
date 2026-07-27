import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { OrganizerSecretsService } from "./organizer-secrets.service";

// Class default: le staff peut consulter le STATUT (booléen configuré/masqué)
// mais chaque endpoint qui touche la VALEUR d'un secret PSP (clé marchande qui
// encaisse l'argent des votes) est restreint à l'owner + admin via un override
// @Roles au niveau méthode — un ORGANIZER_STAFF ne doit jamais pouvoir lire ni
// écrire ces clés (risque de détournement des fonds).
const SECRET_OWNER_ROLES = [UserRole.ORGANIZER_OWNER, UserRole.PLATFORM_ADMIN] as const;

@Controller("organizer/secrets")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF, UserRole.PLATFORM_ADMIN)
export class OrganizerSecretsController {
  constructor(private readonly organizerSecretsService: OrganizerSecretsService) {}

  @Get("payment-setup/status")
  getPaymentSetupStatus(@CurrentUser() user: AuthUser, @Query("eventId") eventId?: string) {
    return this.organizerSecretsService.getPaymentSetupStatus(user, eventId);
  }

  @Post()
  @Roles(...SECRET_OWNER_ROLES)
  saveSecret(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.organizerSecretsService.saveSecret(user, body);
  }

  // Per-event secrets (e.g. the event's own FeexPay account).
  @Post("events/:eventId")
  @Roles(...SECRET_OWNER_ROLES)
  saveEventSecret(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: unknown
  ) {
    return this.organizerSecretsService.saveEventSecret(user, eventId, body);
  }

  @Get("events/:eventId/:key/status")
  getEventSecretStatus(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("key") key: string
  ) {
    return this.organizerSecretsService.getEventSecretStatus(user, eventId, key);
  }

  @Get("events/:eventId/:key")
  @Roles(...SECRET_OWNER_ROLES)
  getEventSecret(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("key") key: string
  ) {
    return this.organizerSecretsService.getEventSecret(user, eventId, key);
  }

  @Get(":key/status")
  getSecretStatus(@CurrentUser() user: AuthUser, @Param("key") key: string) {
    return this.organizerSecretsService.getSecretStatus(user, key);
  }

  @Get(":key")
  @Roles(...SECRET_OWNER_ROLES)
  getSecret(@CurrentUser() user: AuthUser, @Param("key") key: string) {
    return this.organizerSecretsService.getSecret(user, key);
  }
}
