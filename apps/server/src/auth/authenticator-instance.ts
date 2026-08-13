import { DevelopmentAuthenticator } from "./development-authenticator.js";
import type { Authenticator } from "./types.js";

function createAuthenticator(): Authenticator {
  const tokens = process.env.DEV_AUTH_TOKENS ?? "";
  return new DevelopmentAuthenticator(tokens);
}

export const authenticator: Authenticator = createAuthenticator();
