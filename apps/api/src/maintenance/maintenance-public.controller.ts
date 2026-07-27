import { Controller, Get } from "@nestjs/common";
import { MaintenanceService } from "./maintenance.service";

/** Statut public du mode maintenance (sans authentification). */
@Controller("maintenance")
export class MaintenancePublicController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get("status")
  getStatus() {
    return this.maintenanceService.getPublicStatus();
  }
}
