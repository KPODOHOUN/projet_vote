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
import { trustedEdgeClientIp } from "./common/edge-client-ip";

async function bootstrap() {
  initSentry();
  // rawBody: true buffers the exact request bytes (exposed as request.rawBody)
  // so webhook HMAC signatures can be verified over the raw payload — never a
  // re-serialized JSON object (whose key order / whitespace would not match
  // what the provider signed).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Trust exactly API_TRUST_PROXY_HOPS proxies in front of the app (load
  // balancer, the web app's /api/v1 rewrite) so Express derives `request.ip`
  // from X-Forwarded-For itself instead of trusting the header verbatim —
  // without this, a client could spoof their own IP, and with too few hops
  // every visitor would share the proxy's IP (rate limits, signature proof).
  app.getHttpAdapter().getInstance().set("trust proxy", env.API_TRUST_PROXY_HOPS);
  const observabilityService = app.get(ObservabilityService);
  // IP du visiteur relayée par le front, crue seulement avec le secret partagé.
  // Posée avant tout le reste : limites de débit, sessions et preuves de
  // signature lisent toutes `request.ip`.
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const clientIp = trustedEdgeClientIp(request.headers, env.API_EDGE_PROXY_SECRET);
    if (clientIp) Object.defineProperty(request, "ip", { value: clientIp, configurable: true });
    next();
  });
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
