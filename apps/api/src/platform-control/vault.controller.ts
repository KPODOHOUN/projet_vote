import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth.types";
import { VaultOtpGuard } from "./vault-otp.guard";
import { VaultOtpService } from "./vault-otp.service";
import { VaultService } from "./vault.service";

const confirmSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/)
});

// Hidden vault — PLATFORM_SUPER_ADMIN only. Reads (list/reveal) additionally
// require a fresh OTP vault token (VaultOtpGuard). Writes happen only as
// side-effects of cancelVote / deleteVote.
@Controller("admin/platform/vault")
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN)
export class VaultController {
  constructor(
    private readonly vault: VaultService,
    private readonly otp: VaultOtpService
  ) {}

  @Post("unlock")
  requestUnlock(@CurrentUser() user: AuthUser) {
    return this.otp.requestUnlock(user.userId);
  }

  @Post("unlock/confirm")
  async confirmUnlock(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = confirmSchema.parse(body);
    const token = await this.otp.confirmUnlock(user.userId, input.challengeId, input.code);
    return { vaultToken: token };
  }

  @Get()
  @UseGuards(VaultOtpGuard)
  list(@Query() query: unknown) {
    return this.vault.listEntries(query);
  }

  @Get(":id")
  @UseGuards(VaultOtpGuard)
  reveal(@Param("id") id: string) {
    return this.vault.revealEntry(id);
  }
}
