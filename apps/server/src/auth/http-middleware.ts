import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../api/errors.js";
import { authenticator } from "./authenticator-instance.js";

export async function authenticateHttpRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const user = await authenticator.authenticate(token);

  if (!user) {
    throw new UnauthorizedError("Invalid bearer token");
  }

  req.user = user;
  next();
}
