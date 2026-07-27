import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string, @Query("unreadOnly") unreadOnly?: string) {
    return this.notifications.list(user, {
      ...(limit ? { limit: Number(limit) } : {}),
      unreadOnly: unreadOnly === "true"
    });
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser, @Body() _body: unknown) {
    return this.notifications.markAllRead(user);
  }
}
