import "dotenv/config";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { eq } from "drizzle-orm";
import { DEV_SEED_USERS } from "@d3-arcana/dev-auth";

import { db, pool } from "../database.js";
import { users } from "./schema.js";

const ENV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.env",
);

async function findUserId(displayName: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.displayName, displayName))
    .limit(1);

  return user?.id ?? null;
}

export function buildDevAuthTokens(
  entries: Array<{ token: string; userId: string }>,
): string {
  return entries.map((entry) => `${entry.token}:${entry.userId}`).join(",");
}

export function writeDevAuthTokensToEnv(tokens: string): void {
  let envContents: string;

  try {
    envContents = readFileSync(ENV_PATH, "utf8");
  } catch {
    throw new Error(
      `Could not read ${ENV_PATH}. Create it from apps/server/.env.example first.`,
    );
  }

  const line = `DEV_AUTH_TOKENS=${tokens}`;
  const pattern = /^DEV_AUTH_TOKENS=.*$/m;

  if (pattern.test(envContents)) {
    envContents = envContents.replace(pattern, line);
  } else {
    if (!envContents.endsWith("\n")) {
      envContents += "\n";
    }
    envContents += `${line}\n`;
  }

  writeFileSync(ENV_PATH, envContents, "utf8");
}

async function syncAuthTokens(): Promise<string> {
  const entries: Array<{ token: string; userId: string }> = [];
  const missing: string[] = [];

  for (const seedUser of DEV_SEED_USERS) {
    const userId = await findUserId(seedUser.displayName);
    if (!userId) {
      missing.push(seedUser.displayName);
      continue;
    }

    entries.push({ token: seedUser.token, userId });
  }

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} must exist. Run \`pnpm --filter server db:seed\` first.`,
    );
  }

  const tokens = buildDevAuthTokens(entries);
  writeDevAuthTokensToEnv(tokens);

  return tokens;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  syncAuthTokens()
    .then((tokens) => {
      console.log("Updated apps/server/.env:");
      console.log(`DEV_AUTH_TOKENS=${tokens}`);
      console.log("");
      console.log("Restart the server: pnpm dev:server");
    })
    .catch((error) => {
      console.error("Auth token sync failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
