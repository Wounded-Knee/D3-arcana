import { eq } from "drizzle-orm";
import { db } from "../database.js";
import { users } from "../db/schema.js";

export async function createUser(displayName: string) {
  const [user] = await db
    .insert(users)
    .values({
      displayName,
    })
    .returning();

  return user;
}

export async function getUserById(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}
