import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerHealthRoutes } from "./health-routes.js";
import { MockMediaSessionProvider } from "../media/mock-media-provider.js";
import {
  resetMediaSessionProviderForTests,
  setMediaSessionProviderForTests,
} from "../media/media-provider-instance.js";

function createHealthApp() {
  const app = express();
  registerHealthRoutes(app);
  return app;
}

describe("health endpoints", () => {
  let media: MockMediaSessionProvider;

  beforeEach(() => {
    media = new MockMediaSessionProvider();
    setMediaSessionProviderForTests(media);
  });

  afterEach(() => {
    resetMediaSessionProviderForTests();
  });

  it("returns liveness without checking dependencies", async () => {
    const response = await request(createHealthApp()).get("/health").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns database connectivity status", async () => {
    const response = await request(createHealthApp())
      .get("/health/database")
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.database.status).toBe("ok");
    expect(response.body.database.time).toBeDefined();
  });

  it("returns livekit availability", async () => {
    const response = await request(createHealthApp())
      .get("/health/livekit")
      .expect(200);

    expect(response.body).toEqual({
      status: "ok",
      livekit: { status: "ok" },
    });
  });

  it("returns 503 when livekit is unavailable", async () => {
    media.healthResult = { ok: false, error: "connection refused" };

    const response = await request(createHealthApp())
      .get("/health/livekit")
      .expect(503);

    expect(response.body).toEqual({
      status: "error",
      livekit: { status: "error", error: "connection refused" },
    });
  });

  it("returns ready when database and livekit are up", async () => {
    const response = await request(createHealthApp())
      .get("/health/ready")
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.database.status).toBe("ok");
    expect(response.body.livekit.status).toBe("ok");
  });

  it("returns 503 on ready when livekit is down", async () => {
    media.healthResult = { ok: false, error: "connection refused" };

    const response = await request(createHealthApp())
      .get("/health/ready")
      .expect(503);

    expect(response.body.status).toBe("error");
    expect(response.body.database.status).toBe("ok");
    expect(response.body.livekit).toEqual({
      status: "error",
      error: "connection refused",
    });
  });
});
