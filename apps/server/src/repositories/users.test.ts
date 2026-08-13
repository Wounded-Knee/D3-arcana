import { describe, expect, it } from "vitest";

import { createUser, getUserById } from "./users.js";

describe("users repository", () => {
  it("creates and retrieves a user by id", async () => {
    const created = await createUser("Alice");

    expect(created.displayName).toBe("Alice");
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const fetched = await getUserById(created.id);
    expect(fetched).toEqual(created);
  });

  it("returns null for an unknown user id", async () => {
    const user = await getUserById(
      "00000000-0000-4000-8000-000000000001",
    );

    expect(user).toBeNull();
  });
});
