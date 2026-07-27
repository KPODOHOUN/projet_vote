import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { z, ZodError } from "zod";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { ZodExceptionFilter } from "./zod-exception.filter";

function makeHost() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    getHeader() {
      return undefined;
    }
  };
  const req = { headers: { "x-trace-id": "trace-123" }, url: "/api/v1/x" };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req })
  } as unknown as ArgumentsHost;
  return { host, res };
}

test("AllExceptionsFilter: HttpException → status + message + traceId", () => {
  const { host, res } = makeHost();
  new AllExceptionsFilter().catch(new BadRequestException("Champ invalide"), host);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as { message: string }).message, "Champ invalide");
  assert.equal((res.body as { traceId: string }).traceId, "trace-123");
});

test("AllExceptionsFilter: erreur non-HTTP → 500 générique (aucune fuite de détail)", () => {
  const { host, res } = makeHost();
  new AllExceptionsFilter().catch(new Error("stacktrace secret"), host);
  assert.equal(res.statusCode, 500);
  assert.equal((res.body as { message: string }).message, "Erreur interne du serveur.");
});

test("AllExceptionsFilter: message tableau (validation) → joint par ', '", () => {
  const { host, res } = makeHost();
  new AllExceptionsFilter().catch(
    new BadRequestException({ message: ["a", "b"], error: "Bad Request", statusCode: 400 }),
    host
  );
  assert.equal((res.body as { message: string }).message, "a, b");
});

test("ZodExceptionFilter: ZodError → 400 avec errors[]", () => {
  const { host, res } = makeHost();
  const parsed = z.object({ name: z.string() }).safeParse({});
  assert.equal(parsed.success, false);
  new ZodExceptionFilter().catch((parsed as { error: ZodError }).error, host);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as { message: string }).message, "Validation échouée.");
  assert.ok(Array.isArray((res.body as { errors: unknown[] }).errors));
});
