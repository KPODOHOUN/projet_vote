import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AccountService } from "./account.service";

const REFRESH_COOKIE_NAME = "vp_refresh";
function refreshToken(request: Request): string | undefined {
  return (request.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME];
}

@Controller("account")
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  getAccount(@CurrentUser() user: AuthUser) {
    return this.accountService.getAccount(user);
  }

  @Post("password")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() request: Request) {
    return this.accountService.changePassword(user, body, refreshToken(request));
  }

  @Post("email")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  changeEmail(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() request: Request) {
    return this.accountService.changeEmail(user, body, refreshToken(request));
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: AuthUser, @Req() request: Request) {
    return this.accountService.listSessions(user, refreshToken(request));
  }

  @Post("sessions/revoke-others")
  revokeOthers(@CurrentUser() user: AuthUser, @Req() request: Request) {
    return this.accountService.revokeOtherSessions(user, refreshToken(request));
  }

  @Delete("sessions/:id")
  revokeSession(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.accountService.revokeSession(user, id);
  }
}
