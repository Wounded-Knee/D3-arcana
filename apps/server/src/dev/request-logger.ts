import type { Express, Request, Response, NextFunction } from "express";

export function registerDevRequestLogger(app: Express): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();

    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
      );
    });

    next();
  });
}
