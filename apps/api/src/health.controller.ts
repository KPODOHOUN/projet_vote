import { Controller, Get } from "@nestjs/common";
import { healthContract } from "@votezpro/shared";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      ...healthContract,
      version: "v1"
    };
  }

  @Get("ready")
  getReadiness() {
    return {
      service: healthContract.service,
      status: "ready",
      timestamp: new Date().toISOString()
    } as const;
  }
}
