import { Controller, ForbiddenException, Get, Headers } from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { ObservabilityService } from "./observability.service";

@Controller("ops/metrics")
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get()
  getMetrics(@Headers("x-ops-token") opsToken?: string) {
    if (!opsToken || !this.isValidOpsToken(opsToken)) {
      throw new ForbiddenException("Token ops invalide.");
    }

    return this.observabilityService.getSnapshot();
  }

  // Constant-time comparison, consistent with webhook/cron signature checks.
  private isValidOpsToken(provided: string): boolean {
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(env.API_OPS_TOKEN, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
