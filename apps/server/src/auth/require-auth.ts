import type { RequestHandler } from "express";

import { asyncHandler } from "../api/errors.js";
import { authenticateHttpRequest } from "./http-middleware.js";

export const requireAuth: RequestHandler = asyncHandler(authenticateHttpRequest);
