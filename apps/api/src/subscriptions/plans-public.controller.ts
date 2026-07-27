import { Controller, Get } from "@nestjs/common";
import { PlansService } from "../admin/plans/plans.service";

/**
 * Endpoint public pour consulter les plans d'abonnement disponibles.
 * Accessible sans authentification (page Pricing).
 */
@Controller("plans")
export class PlansPublicController {
    constructor(private readonly plansService: PlansService) { }

    /**
     * Liste les plans actifs (public).
     * GET /plans
     */
    @Get()
    listPlans() {
        return this.plansService.listActive();
    }
}

