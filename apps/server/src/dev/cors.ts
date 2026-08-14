import type { Express } from "express";
import cors from "cors";

const DEV_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
];

export function registerDevCors(app: Express): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  app.use(
    cors({
      origin: DEV_ORIGINS,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
}
