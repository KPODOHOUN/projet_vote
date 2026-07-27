import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post("events")
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  track(@Body() body: unknown) {
    return this.analyticsService.track(body);
  }
}
