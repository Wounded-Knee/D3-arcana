import type { Express } from "express";
import cors from "cors";

/** Expo web (Metro) dev ports. */
const DEV_WEB_PORTS = ["8081", "19006"] as const;

/** Private RFC1918 + loopback hostnames allowed in dev. */
const DEV_HOST_PATTERN =
  /^(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;

export function isAllowedDevOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:") {
    return false;
  }

  if (!DEV_WEB_PORTS.includes(parsed.port as (typeof DEV_WEB_PORTS)[number])) {
    return false;
  }

  return DEV_HOST_PATTERN.test(parsed.hostname);
}

export function registerDevCors(app: Express): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedDevOrigin(origin)) {
          callback(null, origin ?? true);
          return;
        }

        callback(null, false);
      },
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
}
