import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = join(rootDir, "packages/dev-auth/users.json");

export const seed = JSON.parse(readFileSync(seedPath, "utf8"));

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function printShellExports() {
  for (const user of seed.users) {
    const env = user.key.toUpperCase();
    console.log(`export ${env}_TOKEN=${shellQuote(user.token)}`);
    console.log(`export ${env}_DISPLAY_NAME=${shellQuote(user.displayName)}`);
  }

  console.log(
    `export DEV_CONVERSATION_NAME=${shellQuote(seed.conversationName)}`,
  );
  console.log(
    `export DEV_SEED_KEYS=${shellQuote(
      seed.users.map((user) => user.key).join(" "),
    )}`,
  );
}

const isMain =
  Boolean(process.argv[1]) &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  if (process.argv.includes("--shell")) {
    printShellExports();
  } else {
    console.log(JSON.stringify(seed));
  }
}
