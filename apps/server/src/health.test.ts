import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { pool } from "./database.js";

function createHealthTestApp() {
  const app = express();

  app.get("/health/database", async (_req, res) => {
    try {
      const result = await pool.query("SELECT NOW() AS now");

      res.json({
        status: "ok",
        database: "connected",
        time: result.rows[0].now,
      });
    } catch (error) {
      console.error("Database health check failed:", error);

      res.status(500).json({
        status: "error",
        database: "disconnected",
      });
    }
  });

  return app;
}

describe("health endpoints", () => {
  it("returns database connectivity status", async () => {
    const app = createHealthTestApp();

    const response = await request(app).get("/health/database").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.database).toBe("connected");
    expect(response.body.time).toBeDefined();
  });
});
