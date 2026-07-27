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
