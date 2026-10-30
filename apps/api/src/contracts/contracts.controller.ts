import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { PLATFORM_OPERATOR_ROLES } from "../auth/platform-roles";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ContractsService } from "./contracts.service";

function sendPdf(res: Response, file: { filename: string; bytes: Buffer }) {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${file.filename}"`,
    "Content-Length": String(file.bytes.length),
    "Cache-Control": "private, no-store"
  });
  res.send(file.bytes);
}

/** Contrat d'un concours, côté organisateur (limité à son propre espace par le service). */
@Controller("events/:eventId/contract")
@UseGuards(AuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  overview(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    return this.contracts.getOverview(user, eventId);
  }

  @Post()
  @Roles(UserRole.ORGANIZER_OWNER)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  generate(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string, @Body() body: unknown) {
    return this.contracts.generate(user, eventId, body);
  }

  @Post(":contractId/code")
  @Roles(UserRole.ORGANIZER_OWNER)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  sendCode(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string, @Param("contractId") contractId: string) {
    return this.contracts.sendSignatureCode(user, eventId, contractId);
  }

  @Post(":contractId/sign")
  @Roles(UserRole.ORGANIZER_OWNER)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  sign(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("contractId") contractId: string,
    @Body() body: unknown,
    @Req() request: Request
  ) {
    return this.contracts.sign(user, eventId, contractId, body, {
      ip: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });
  }

  @Get(":contractId/pdf")
  @Roles(UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF)
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("contractId") contractId: string,
    @Res() res: Response
  ) {
    sendPdf(res, await this.contracts.getPdf(user, eventId, contractId));
  }
}

/** Contrats côté administration : consultation des preuves et téléchargement journalisé. */
@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles(...PLATFORM_OPERATOR_ROLES)
export class AdminContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get("events/:eventId/contracts")
  list(@Param("eventId") eventId: string) {
    return this.contracts.adminList(eventId);
  }

  @Get("contracts/:contractId/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("contractId") contractId: string, @Res() res: Response) {
    sendPdf(res, await this.contracts.adminPdf(user, contractId));
  }
}
