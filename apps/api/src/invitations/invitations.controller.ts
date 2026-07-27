import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { InvitationsService } from "./invitations.service";

// Organizer member management. Creating/revoking is OWNER-only; accepting an
// invitation is public and handled by AuthController (it mints tokens).
@Controller("organizer/invitations")
@UseGuards(AuthGuard, RolesGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.PLATFORM_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.invitationsService.createInvitation(user, body);
  }

  @Get()
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF, UserRole.PLATFORM_ADMIN)
  list(@CurrentUser() user: AuthUser) {
    return this.invitationsService.listInvitations(user);
  }

  @Delete(":invitationId")
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.PLATFORM_ADMIN)
  revoke(@CurrentUser() user: AuthUser, @Param("invitationId") invitationId: string) {
    return this.invitationsService.revokeInvitation(user, invitationId);
  }
}
