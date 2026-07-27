import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Response } from "express";
import * as QRCode from "qrcode";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { TicketsService } from "./tickets.service";
import { env } from "../config/env";

const EVENT_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.ORGANIZER_OWNER, UserRole.ORGANIZER_STAFF] as const;

@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get("events/:eventId/ticket-types")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  listTicketTypes(@Param("eventId") eventId: string) {
    return this.tickets.listTicketTypes(eventId);
  }

  @Post("events/:eventId/ticket-types")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  createTicketType(@Param("eventId") eventId: string, @Body() body: unknown) {
    return this.tickets.createTicketType(eventId, body);
  }

  @Get("events/:eventId/ticket-types/:id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  getTicketType(@Param("id") id: string) {
    return this.tickets.getTicketType(id);
  }

  @Patch("events/:eventId/ticket-types/:id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  updateTicketType(@Param("eventId") eventId: string, @Param("id") id: string, @Body() body: unknown) {
    return this.tickets.updateTicketType(eventId, id, body);
  }

  @Delete("events/:eventId/ticket-types/:id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  deleteTicketType(@Param("eventId") eventId: string, @Param("id") id: string) {
    return this.tickets.deleteTicketType(eventId, id);
  }

  @Get("events/:eventId/ticket-types/:id/design")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  getDesign(@Param("id") id: string) {
    return this.tickets.getDesign(id);
  }

  @Put("events/:eventId/ticket-types/:id/design")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  saveDesign(@Param("id") id: string, @Body() body: unknown) {
    return this.tickets.saveDesign(id, body);
  }

  @Get("events/:eventId/tickets")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  listTickets(
    @Param("eventId") eventId: string,
    @Query("status") status?: string,
    @Query("ticketTypeId") ticketTypeId?: string
  ) {
    return this.tickets.listTickets(eventId, { status, ticketTypeId });
  }

  @Get("events/:eventId/tickets/stats")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  getTicketStats(@Param("eventId") eventId: string) {
    return this.tickets.getTicketStats(eventId);
  }

  @Get("events/:eventId/tickets/stats/daily")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  getDailySales(@Param("eventId") eventId: string) {
    return this.tickets.getDailySales(eventId);
  }

  @Get("events/:eventId/tickets/export/csv")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  async exportCsv(@Param("eventId") eventId: string, @Res() res: Response) {
    const csv = await this.tickets.exportTicketsCsv(eventId);
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${date}.csv"`
    });
    res.send(csv);
  }

  @Post("tickets/validate")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...EVENT_ROLES)
  validateTicket(@Body() body: unknown) {
    return this.tickets.validateTicket(body);
  }

  @Get("public/events/:eventSlug/ticket-types")
  listPublicTicketTypes(@Param("eventSlug") eventSlug: string) {
    return this.tickets.listPublicTicketTypes(eventSlug);
  }

  @Post("public/events/:eventSlug/tickets/purchase")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  purchaseTickets(@Param("eventSlug") eventSlug: string, @Body() body: unknown) {
    return this.tickets.purchaseTickets(eventSlug, body);
  }

  @Get("public/tickets/:id")
  getTicket(@Param("id") id: string) {
    return this.tickets.getTicket(id);
  }

  @Get("public/tickets/:id/qr")
  async getTicketQr(@Param("id") id: string, @Res() res: Response) {
    const ticket = await this.tickets.getTicket(id);
    const publicUrl = env.APP_PUBLIC_URL;
    const qrData = `${publicUrl}/t/${ticket.id}?s=${ticket.qrSecret}`;
    const qrBuffer = await QRCode.toBuffer(qrData, { type: "png", margin: 2, width: 400 });
    res.set({ "Content-Type": "image/png", "Content-Length": qrBuffer.length.toString() });
    res.send(qrBuffer);
  }
}
