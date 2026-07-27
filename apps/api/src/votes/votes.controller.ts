import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { VotesService } from "./votes.service";

@Controller("votes")
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Get("public/:tenantSlug/events")
  listPublicEvents(@Param("tenantSlug") tenantSlug: string) {
    return this.votesService.listPublicEvents(tenantSlug);
  }

  @Get("public/:tenantSlug/events/:eventSlug")
  getPublicEvent(@Param("tenantSlug") tenantSlug: string, @Param("eventSlug") eventSlug: string) {
    return this.votesService.getPublicEvent(tenantSlug, eventSlug);
  }

  // Event-centric public entry point (ADR-016): /e/{eventSlug} resolves here.
  @Get("public/event/:eventSlug")
  getPublicEventBySlug(@Param("eventSlug") eventSlug: string) {
    return this.votesService.getPublicEventBySlug(eventSlug);
  }

  @Get("public/event/:eventSlug/results")
  getPublicEventResults(@Param("eventSlug") eventSlug: string) {
    return this.votesService.getPublicEventResults(eventSlug);
  }

  @Get("public/event/:eventSlug/candidate/:ref")
  getPublicCandidate(@Param("eventSlug") eventSlug: string, @Param("ref") ref: string) {
    return this.votesService.getPublicCandidate(eventSlug, ref);
  }

  @Post("cast")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  castVote(@Body() body: unknown) {
    return this.votesService.castVote(body);
  }
}
