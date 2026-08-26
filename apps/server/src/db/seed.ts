import "dotenv/config";

import { eq } from "drizzle-orm";
import {
  DEV_CONVERSATION_NAME,
  DEV_SEED_USERS,
} from "@d3-arcana/dev-auth";

import { db, pool } from "../database.js";
import {
  conversationMembers,
  conversations,
  users,
} from "./schema.js";
import { createConversation } from "../repositories/conversations.js";
import { createUser } from "../repositories/users.js";

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
  const seededUsers: Array<
    (typeof DEV_SEED_USERS)[number] & { id: string }
  > = [];

  for (const seedUser of DEV_SEED_USERS) {
    let user = await findUserByDisplayName(seedUser.displayName);
    if (!user) {
      user = await createUser(seedUser.displayName);
      console.log(`Created user ${seedUser.displayName} (${user.id})`);
    } else {
      console.log(
        `User ${seedUser.displayName} already exists (${user.id})`,
      );
    }

    seededUsers.push({ ...seedUser, id: user.id });
  }

  const creator = seededUsers[0];
  if (!creator) {
    throw new Error("DEV_SEED_USERS must contain at least one user");
  }

  let conversation = await findConversationByName(DEV_CONVERSATION_NAME);
  if (!conversation) {
    conversation = await createConversation(
      DEV_CONVERSATION_NAME,
      creator.id,
    );
    console.log(
      `Created conversation ${DEV_CONVERSATION_NAME} (${conversation.id})`,
    );
  } else {
    console.log(
      `Conversation ${DEV_CONVERSATION_NAME} already exists (${conversation.id})`,
    );
  }

  const membership = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversation.id));

  const memberIds = new Set(membership.map((member) => member.userId));

  for (const user of seededUsers) {
    if (memberIds.has(user.id)) {
      continue;
    }

    await db.insert(conversationMembers).values({
      conversationId: conversation.id,
      userId: user.id,
    });
    console.log(`Added ${user.displayName} to ${DEV_CONVERSATION_NAME}`);
  }

  console.log("");
  console.log("Seed complete. Syncing DEV_AUTH_TOKENS to apps/server/.env ...");

  const { buildDevAuthTokens, writeDevAuthTokensToEnv } = await import(
    "./sync-auth-tokens.js"
  );
  const devAuthTokens = buildDevAuthTokens(
    seededUsers.map((user) => ({ token: user.token, userId: user.id })),
  );
  writeDevAuthTokensToEnv(devAuthTokens);

  console.log(`DEV_AUTH_TOKENS=${devAuthTokens}`);
  console.log("");
  console.log("Development tokens:");
  for (const user of seededUsers) {
    const env = user.key.toUpperCase();
    console.log(`  ${env}_TOKEN=${user.token}`);
    console.log(`  ${env}_ID=${user.id}`);
  }
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
