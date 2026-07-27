import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { OAuthService } from "./oauth.service";

const callbackSchema = z.object({
  provider: z.enum(["google", "facebook"]),
  code: z.string().min(1),
  state: z.string().min(1),
});

const REFRESH_COOKIE_NAME = "vp_refresh";
const REFRESH_COOKIE_SAME_SITE = "lax" as const;
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: REFRESH_COOKIE_SAME_SITE,
  path: "/api/v1",
  maxAge: env.API_REFRESH_TOKEN_EXPIRES_IN_SECONDS * 1000,
};

function extractSessionMeta(request: Request) {
  const ipAddress = request.ip ?? null;
  const userAgent = request.headers["user-agent"] ?? null;
  return { userAgent, ipAddress };
}

@Controller("auth/oauth")
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get(":provider/authorize")
  authorize(@Param("provider") provider: string, @Res({ passthrough: true }) response: Response) {
    const { url, state } = this.oauthService.getAuthorizationUrl(provider);
    response.cookie("oauth_state", state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1",
      maxAge: 10 * 60 * 1000,
    });
    return { url };
  }

  @Post("callback")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async callback(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const input = callbackSchema.parse(body);
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const stateFromCookie = cookies?.["oauth_state"];

    const result = await this.oauthService.handleCallback(
      input.provider,
      input.code,
      input.state,
      stateFromCookie,
      extractSessionMeta(request)
    );

    response.clearCookie("oauth_state", { path: "/api/v1" });
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }
}
