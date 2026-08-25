import { eq } from "drizzle-orm";
import { db } from "../database.js";
import { userPreferences, users } from "../db/schema.js";

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

const DEFAULT_TIMELINE_ORIENTATION = "horizontal" as const;

export type TimelineOrientation = "horizontal" | "vertical";

export type UserPreferences = {
  timelineOrientation: TimelineOrientation;
  updatedAt: Date | null;
};

function parseOrientation(value: string): TimelineOrientation {
  return value === "vertical" ? "vertical" : DEFAULT_TIMELINE_ORIENTATION;
}

export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (!row) {
    return {
      timelineOrientation: DEFAULT_TIMELINE_ORIENTATION,
      updatedAt: null,
    };
  }

  return {
    timelineOrientation: parseOrientation(row.timelineOrientation),
    updatedAt: row.updatedAt,
  };
}

export async function upsertUserPreferences(
  userId: string,
  input: { timelineOrientation: TimelineOrientation },
): Promise<UserPreferences> {
  const now = new Date();
  const [row] = await db
    .insert(userPreferences)
    .values({
      userId,
      timelineOrientation: input.timelineOrientation,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        timelineOrientation: input.timelineOrientation,
        updatedAt: now,
      },
    })
    .returning();

  return {
    timelineOrientation: parseOrientation(row!.timelineOrientation),
    updatedAt: row!.updatedAt,
  };
}
