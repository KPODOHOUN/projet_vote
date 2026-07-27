import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { EventsService } from "./events.service";

const EVENT_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF] as const;
const EVENT_OWNER_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER] as const;

@Controller("events")
@UseGuards(AuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Roles(...EVENT_ROLES)
  listTenantEvents(@CurrentUser() user: AuthUser) {
    return this.eventsService.listTenantEvents(user);
  }

  @Post("quick-start")
  @Roles(...EVENT_ROLES)
  quickStartEvent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.eventsService.quickStartEvent(user, body);
  }

  @Post()
  @Roles(...EVENT_ROLES)
  createEvent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.eventsService.createEvent(user, body);
  }

  @Get(":eventId/dashboard")
  @Roles(...EVENT_ROLES)
  getEventDashboard(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.getEventDashboard(user, eventId);
  }

  @Get(":eventId")
  @Roles(...EVENT_ROLES)
  getEvent(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.getEvent(user, eventId);
  }

  @Get(":eventId/candidates")
  @Roles(...EVENT_ROLES)
  listCandidates(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.listCandidates(user, eventId);
  }

  @Post(":eventId/candidates/bulk")
  @Roles(...EVENT_ROLES)
  importCandidates(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: unknown
  ) {
    return this.eventsService.importCandidates(user, eventId, body);
  }

  @Post(":eventId/candidates")
  @Roles(...EVENT_ROLES)
  createCandidate(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: unknown
  ) {
    return this.eventsService.createCandidate(user, eventId, body);
  }

  @Patch(":eventId/candidates/:candidateId")
  @Roles(...EVENT_ROLES)
  updateCandidate(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown
  ) {
    return this.eventsService.updateCandidate(user, eventId, candidateId, body);
  }

  @Patch(":eventId/candidates/:candidateId/vote-count")
  @Roles(...EVENT_OWNER_ROLES)
  setCandidateVoteCount(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown
  ) {
    return this.eventsService.setCandidateVoteCount(user, eventId, candidateId, body);
  }

  @Delete(":eventId/candidates/:candidateId")
  @Roles(...EVENT_OWNER_ROLES)
  deleteCandidate(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("candidateId") candidateId: string
  ) {
    return this.eventsService.deleteCandidate(user, eventId, candidateId);
  }

  @Get(":eventId/results")
  @Roles(...EVENT_ROLES)
  getEventResults(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.getEventResults(user, eventId);
  }

  @Patch(":eventId")
  @Roles(...EVENT_OWNER_ROLES)
  updateEvent(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body() body: unknown
  ) {
    return this.eventsService.updateEvent(user, eventId, body);
  }

  @Delete(":eventId")
  @Roles(...EVENT_OWNER_ROLES)
  deleteEvent(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.eventsService.deleteEvent(user, eventId);
  }
}
