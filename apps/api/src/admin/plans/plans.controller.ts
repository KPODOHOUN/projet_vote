import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/auth.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { Roles } from "../../auth/roles.decorator";
import type { AuthUser } from "../../auth/auth.types";
import { PlansService } from "./plans.service";

const ADMIN_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.PLATFORM_SUPER_ADMIN] as const;

@Controller("admin/plans")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
export class PlansController {
    constructor(private readonly plansService: PlansService) { }

    /**
     * Liste tous les plans (admin). Inclut les plans inactifs.
     * GET /admin/plans
     */
    @Get()
    listAll(@CurrentUser() user: AuthUser) {
        return this.plansService.listAll(user);
    }

    /**
     * Récupère un plan par son ID.
     * GET /admin/plans/:id
     */
    @Get(":id")
    getById(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.plansService.getById(user, id);
    }

    /**
     * Crée un nouveau plan.
     * POST /admin/plans
     */
    @Post()
    create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
        return this.plansService.create(user, body);
    }

    /**
     * Met à jour un plan existant.
     * PUT /admin/plans/:id
     */
    @Put(":id")
    update(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Body() body: unknown
    ) {
        return this.plansService.update(user, id, body);
    }

    /**
     * Supprime (ou désactive) un plan.
     * DELETE /admin/plans/:id
     */
    @Delete(":id")
    delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.plansService.delete(user, id);
    }
}

