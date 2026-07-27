import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Request, Response } from "express";
import { captureSentryException } from "../observability/sentry";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    console.error("Unhandled Exception:", exception);
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = (() => {
      if (!isHttpException) {
        return "Erreur interne du serveur.";
      }
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const maybeMessage = (exceptionResponse as { message?: unknown }).message;
        if (Array.isArray(maybeMessage)) {
          return maybeMessage.join(", ");
        }
        if (typeof maybeMessage === "string") {
          return maybeMessage;
        }
      }
      return exception.message;
    })();

    const traceId =
      request.headers["x-trace-id"]?.toString() ?? response.getHeader("x-trace-id")?.toString();

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      captureSentryException(exception, {
        traceId: traceId ?? "missing-trace-id",
        path: request.url,
        statusCode: status
      });
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      traceId,
      timestamp: new Date().toISOString()
    });
  }
}
