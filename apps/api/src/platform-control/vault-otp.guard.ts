import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { VaultOtpService } from "./vault-otp.service";

// Requires a fresh vault token (header `x-vault-token`) bound to the current
// super-admin, on top of the role guard. Applied to the read endpoints only.
@Injectable()
export class VaultOtpGuard implements CanActivate {
  constructor(private readonly otp: VaultOtpService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = (request.headers["x-vault-token"] ?? "").toString();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("Authentification requise.");
    }
    if (!token || !this.otp.verifyToken(token, user.userId)) {
      throw new UnauthorizedException("Token coffre invalide ou expiré.");
    }
    return true;
  }
}
