import { getUserById } from "../repositories/users.js";
import type { AuthenticatedUser, Authenticator } from "./types.js";

/**
 * Development-only authenticator that maps opaque bearer tokens to user IDs
 * via the DEV_AUTH_TOKENS environment variable. Not for production use.
 */
function parseTokenMap(config: string): Map<string, string> {
  const map = new Map<string, string>();

  if (!config.trim()) {
    return map;
  }

  for (const pair of config.split(",")) {
    const colonIndex = pair.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const token = pair.slice(0, colonIndex).trim();
    const userId = pair.slice(colonIndex + 1).trim();

    if (token && userId) {
      map.set(token, userId);
    }
  }

  return map;
}

export class DevelopmentAuthenticator implements Authenticator {
  private readonly tokenMap: Map<string, string>;

  constructor(tokenConfig: string) {
    this.tokenMap = parseTokenMap(tokenConfig);
  }

  async authenticate(token: string): Promise<AuthenticatedUser | null> {
    const userId = this.tokenMap.get(token);
    if (!userId) {
      return null;
    }

    const user = await getUserById(userId);
    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      displayName: user.displayName,
    };
  }
}
