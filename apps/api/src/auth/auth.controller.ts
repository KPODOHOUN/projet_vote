import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import type { AuthUser } from "./auth.types";
import { env } from "../config/env";

function extractSessionMeta(request: Request) {
  // With Express `trust proxy` enabled (see main.ts), `request.ip` already
  // resolves the real client IP from X-Forwarded-For for the trusted hop —
  // no need to parse the header by hand here.
  const ipAddress = request.ip ?? null;
  const userAgent = request.headers["user-agent"] ?? null;
  return { userAgent, ipAddress };
}

const REFRESH_COOKIE_NAME = "vp_refresh";
// Path is "/api/v1" (not "/api/v1/auth") so the refresh cookie also reaches the
// `/account/*` routes that identify the caller's current session (GET
// /account/sessions marking the current session, revoke-others on password/email
// change).
// sameSite is "lax" everywhere: it keeps cross-site CSRF protection on this
// auth cookie and is sufficient whenever the web app and API share a registrable
// domain (e.g. app.votezpro.africa + api.votezpro.africa). Only switch to "none"
// (which also requires secure: true, already set in prod) if the web and API are
// ever deployed on genuinely DIFFERENT registrable domains (true cross-site) —
// and pair that with an Origin check on POST /auth/refresh, the lone
// cookie-authenticated route.
const REFRESH_COOKIE_SAME_SITE = "lax" as const;
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: REFRESH_COOKIE_SAME_SITE,
  path: "/api/v1",
  maxAge: env.API_REFRESH_TOKEN_EXPIRES_IN_SECONDS * 1000
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.register(body, extractSessionMeta(request));
    if ("accessToken" in result) {
      response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
      return { accessToken: result.accessToken };
    }
    return result;
  }

  @Post("accept-invitation")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async acceptInvitation(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.acceptInvitation(body, extractSessionMeta(request));
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }

  @Post("login")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(body, extractSessionMeta(request));
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }

  @Post("refresh")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    // Read refresh token from cookie first, fallback to body for backward compatibility
    const cookieToken = (request.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME];
    const payload = cookieToken ? { refreshToken: cookieToken } : request.body;
    const result = await this.authService.refresh(payload, extractSessionMeta(request));
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown
  ) {
    // Read refresh token from cookie first, fallback to body for backward compatibility
    const cookieToken = (request.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME];
    const payload = cookieToken ? { refreshToken: cookieToken } : body;
    const result = await this.authService.logout(payload);
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: REFRESH_COOKIE_SAME_SITE,
      path: "/api/v1"
    });
    return result;
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post("verify-email")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  verifyEmail(@Body() body: unknown) {
    return this.authService.verifyEmail(body);
  }

  @Post("resend-verification")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  resendVerification(@Body() body: unknown) {
    return this.authService.resendVerificationEmail(body);
  }

  @Post("forgot-password")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  forgotPassword(@Body() body: unknown) {
    return this.authService.forgotPassword(body);
  }

  @Post("reset-password")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(body);
  }
}
