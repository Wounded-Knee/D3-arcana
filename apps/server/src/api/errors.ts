import type { NextFunction, Request, RequestHandler, Response } from "express";

import { InvalidCursorError } from "../repositories/messages.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, "bad_request", details);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message, "not_found");
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message, "unauthorized");
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message, "forbidden");
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.code !== undefined && { code: err.code }),
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  if (err instanceof InvalidCursorError) {
    res.status(400).json({
      error: err.message,
      code: "bad_request",
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
