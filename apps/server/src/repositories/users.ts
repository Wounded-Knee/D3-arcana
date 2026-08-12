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