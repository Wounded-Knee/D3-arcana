import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerDevCors } from "./cors.js";

function createCorsTestApp() {
  const app = express();
  registerDevCors(app);
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  return app;
}

describe("dev CORS", () => {
  it("responds to preflight from an allowed Expo web origin", async () => {
    const app = createCorsTestApp();

    const response = await request(app)
      .options("/health")
      .set("Origin", "http://localhost:8081")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8081",
    );
  });

  it("allows GET requests from an allowed origin", async () => {
    const app = createCorsTestApp();

    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:8081")
      .expect(200);

    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8081",
    );
  });

  it("does not reflect disallowed origins", async () => {
    const app = createCorsTestApp();

    const response = await request(app)
      .get("/health")
      .set("Origin", "http://evil.example")
      .expect(200);

    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows GET requests from a LAN Expo web origin", async () => {
    const app = createCorsTestApp();

    const response = await request(app)
      .get("/health")
      .set("Origin", "http://192.168.1.50:8081")
      .expect(200);

    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://192.168.1.50:8081",
    );
  });

  it("does not allow public internet origins", async () => {
    const app = createCorsTestApp();

    const response = await request(app)
      .get("/health")
      .set("Origin", "http://203.0.113.10:8081")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows Authorization in preflight requests", async () => {
    const app = createCorsTestApp();

    const response = await request(app)
      .options("/health")
      .set("Origin", "http://localhost:8081")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization")
      .expect(204);

    expect(response.headers["access-control-allow-headers"])
      .toMatch(/Authorization/i);
  });
});
