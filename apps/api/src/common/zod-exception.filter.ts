import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = HttpStatus.BAD_REQUEST;

    const traceId =
      request.headers["x-trace-id"]?.toString() ?? response.getHeader("x-trace-id")?.toString();

    response.status(status).json({
      statusCode: status,
      message: "Validation échouée.",
      errors: exception.errors.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      })),
      path: request.url,
      traceId,
      timestamp: new Date().toISOString()
    });
  }
}
