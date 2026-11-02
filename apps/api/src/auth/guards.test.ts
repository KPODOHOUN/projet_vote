import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "./auth.guard";
import { RolesGuard } from "./roles.guard";
import type { AuthService } from "./auth.service";

function httpCtx(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined
  } as unknown as ExecutionContext;
}

test("AuthGuard: rejette quand le header Authorization est absent", async () => {
  const guard = new AuthGuard({
    verifyAccessToken: async () => {
      throw new Error("should not be called");
    }
  } as unknown as AuthService);
  await assert.rejects(guard.canActivate(httpCtx({ headers: {} })), /Token manquant/);
});

test("AuthGuard: attache l'utilisateur résolu quand le token est valide", async () => {
  const authUser = { userId: "u", tenantId: "t", role: UserRole.ORGANIZER_OWNER, email: "e@e.bj" };
  const guard = new AuthGuard({ verifyAccessToken: async () => authUser } as unknown as AuthService);
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: { authorization: "Bearer good-token" }
  };
  assert.equal(await guard.canActivate(httpCtx(req)), true);
  assert.deepEqual(req.user, authUser);
});

test("RolesGuard: laisse passer quand aucun rôle n'est requis", () => {
  const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  assert.equal(guard.canActivate(httpCtx({ user: { role: UserRole.ORGANIZER_STAFF } })), true);
});

test("RolesGuard: autorise le bon rôle, refuse les autres et l'absence d'utilisateur", () => {
  const reflector = { getAllAndOverride: () => [UserRole.PLATFORM_ADMIN] } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  assert.equal(guard.canActivate(httpCtx({ user: { role: UserRole.PLATFORM_ADMIN } })), true);
  assert.throws(() => guard.canActivate(httpCtx({ user: { role: UserRole.ORGANIZER_OWNER } })), /non autorisée/);
  assert.throws(() => guard.canActivate(httpCtx({ user: undefined })), /non autorisée/);
});

test("jeton expiré, falsifié ou mal formé : 401, jamais 500", async () => {
  const { SignJWT } = await import("jose");
  const { AuthService } = await import("./auth.service");
  const { PrismaService } = await import("../prisma/prisma.service");
  const { NotificationsService } = await import("../notifications/notifications.service");
  const { MailService } = await import("../mail/mail.service");
  const { env } = await import("../config/env");
  const { UnauthorizedException } = await import("@nestjs/common");
  const prismaService = new PrismaService();
  const auth = new AuthService(prismaService, new NotificationsService(prismaService), new MailService());
  const key = new TextEncoder().encode(env.API_JWT_SECRET);
  const claims = { tenantId: "t", role: "ORGANIZER_OWNER", email: "a@b.io" };
  const expired = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject("u").setIssuer("shadowa-votes").setAudience("shadowa-votes-api").setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key);
  const forged = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject("u").setIssuer("shadowa-votes").setAudience("shadowa-votes-api").setExpirationTime("1h").sign(new TextEncoder().encode("x".repeat(40)));
  for (const [token, message] of [[expired, /Session expirée/], [forged, /Session invalide/], ["pas-un-jeton", /Session invalide/]] as const) {
    await assert.rejects(auth.verifyAccessToken(token), (error: unknown) => error instanceof UnauthorizedException && message.test((error as Error).message));
  }
  await prismaService.client.$disconnect();
});
