import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { ZodExceptionFilter } from "./common/zod-exception.filter";
import { ObservabilityService } from "./observability/observability.service";
import { initSentry } from "./observability/sentry";
import { env } from "./config/env";

async function bootstrap() {
  initSentry();
  // rawBody: true buffers the exact request bytes (exposed as request.rawBody)
  // so webhook HMAC signatures can be verified over the raw payload — never a
  // re-serialized JSON object (whose key order / whitespace would not match
  // what the provider signed).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Trust exactly one hop in front of the app (Cloud Run's load balancer /
  // the web app's reverse proxy) so Express derives `request.ip` from
  // X-Forwarded-For itself instead of trusting the header verbatim — without
  // this, a client could spoof their own IP by sending an X-Forwarded-For
  // header directly, which would otherwise be taken at face value by any
  // code reading that header (e.g. account session metadata / audit log).
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  const observabilityService = app.get(ObservabilityService);
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestStartedAt = Date.now();
    const traceId = request.headers["x-trace-id"]?.toString() ?? randomUUID();
    request.headers["x-trace-id"] = traceId;
    response.setHeader("x-trace-id", traceId);
    response.on("finish", () => {
      const durationMs = Date.now() - requestStartedAt;
      observabilityService.recordRequest({
        timestamp: Date.now(),
        durationMs,
        statusCode: response.statusCode
      });
      // Structured access log to stdout (captured by the platform's log
      // pipeline). Written directly rather than via console.log to keep the
      // logging surface explicit and lint-clean.
      process.stdout.write(
        `${JSON.stringify({
          level: "info",
          traceId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs,
          timestamp: new Date().toISOString()
        })}\n`
      );
    });
    next();
  });
  app.use(helmet());

  const corsOrigins = (() => {
    if (env.NODE_ENV === "development") {
      return true as const;
    }
    if (env.API_CORS_ORIGINS) {
      return env.API_CORS_ORIGINS.split(",").map((origin) => origin.trim());
    }
    return ["http://localhost:3000", "http://127.0.0.1:3000"];
  })();

  app.enableCors({
    origin: corsOrigins,
    credentials: true
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AllExceptionsFilter(), new ZodExceptionFilter());
  // Drain on SIGTERM/SIGINT (Cloud Run reaps containers with SIGTERM): runs
  // every provider's onApplicationShutdown, notably PrismaService.$disconnect().
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
