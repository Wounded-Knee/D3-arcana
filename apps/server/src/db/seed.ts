import "dotenv/config";

import { eq } from "drizzle-orm";

import { db, pool } from "../database.js";
import {
  conversationMembers,
  conversations,
  users,
} from "./schema.js";
import { createConversation } from "../repositories/conversations.js";
import { createUser } from "../repositories/users.js";

const ALICE_TOKEN = "dev-alice";
const BOB_TOKEN = "dev-bob";

async function findUserByDisplayName(displayName: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.displayName, displayName))
    .limit(1);

  return user ?? null;
}

async function findConversationByName(name: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.name, name))
    .limit(1);

  return conversation ?? null;
}

async function seed() {
  let alice = await findUserByDisplayName("Alice");
  if (!alice) {
    alice = await createUser("Alice");
    console.log(`Created user Alice (${alice.id})`);
  } else {
    console.log(`User Alice already exists (${alice.id})`);
  }

  let bob = await findUserByDisplayName("Bob");
  if (!bob) {
    bob = await createUser("Bob");
    console.log(`Created user Bob (${bob.id})`);
  } else {
    console.log(`User Bob already exists (${bob.id})`);
  }

  let conversation = await findConversationByName("Bridge Discussion");
  if (!conversation) {
    conversation = await createConversation(
      "Bridge Discussion",
      alice.id,
    );
    console.log(
      `Created conversation Bridge Discussion (${conversation.id})`,
    );
  } else {
    console.log(
      `Conversation Bridge Discussion already exists (${conversation.id})`,
    );
  }

  const bobMembership = await db
    .select()
    .from(conversationMembers)
    .where(
      eq(conversationMembers.conversationId, conversation.id),
    );

  const bobIsMember = bobMembership.some(
    (member) => member.userId === bob.id,
  );

  if (!bobIsMember) {
    await db.insert(conversationMembers).values({
      conversationId: conversation.id,
      userId: bob.id,
    });
    console.log("Added Bob to Bridge Discussion");
  }

  console.log("");
  console.log("Seed complete. Syncing DEV_AUTH_TOKENS to apps/server/.env ...");

  const { buildDevAuthTokens, writeDevAuthTokensToEnv } = await import(
    "./sync-auth-tokens.js"
  );
  const devAuthTokens = buildDevAuthTokens(alice.id, bob.id);
  writeDevAuthTokensToEnv(devAuthTokens);

  console.log(`DEV_AUTH_TOKENS=${devAuthTokens}`);
  console.log("");
  console.log("Development tokens:");
  console.log(`  ALICE_TOKEN=${ALICE_TOKEN}`);
  console.log(`  BOB_TOKEN=${BOB_TOKEN}`);
  console.log(`  ALICE_ID=${alice.id}`);
  console.log(`  BOB_ID=${bob.id}`);
  console.log(`  CONVERSATION_ID=${conversation.id}`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
