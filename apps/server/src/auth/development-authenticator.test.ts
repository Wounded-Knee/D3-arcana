import { describe, expect, it } from "vitest";

import { DevelopmentAuthenticator } from "./development-authenticator.js";
import { createUser } from "../repositories/users.js";

describe("DevelopmentAuthenticator", () => {
  it("maps opaque tokens to existing users", async () => {
    const user = await createUser("Alice");
    const authenticator = new DevelopmentAuthenticator(
      `dev-alice:${user.id}`,
    );

    const authenticated = await authenticator.authenticate("dev-alice");

    expect(authenticated).toEqual({
      userId: user.id,
      displayName: "Alice",
    });
  });

  it("returns null for unknown tokens", async () => {
    const user = await createUser("Alice");
    const authenticator = new DevelopmentAuthenticator(
      `dev-alice:${user.id}`,
    );

    expect(await authenticator.authenticate("unknown")).toBeNull();
  });

  it("returns null when the mapped user no longer exists", async () => {
    const authenticator = new DevelopmentAuthenticator(
      "dev-alice:00000000-0000-4000-8000-000000000001",
    );

    expect(await authenticator.authenticate("dev-alice")).toBeNull();
  });
});
