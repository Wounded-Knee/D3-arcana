// Metro cannot parse `with { type: "json" }`; NodeNext wants it. Runtime (tsx + Metro) accepts a plain JSON import.
// @ts-expect-error TS1543 import attributes required by NodeNext
import seed from "../users.json";

export type DevSeedUser = {
  key: string;
  displayName: string;
  token: string;
};

export const DEV_CONVERSATION_NAME: string = seed.conversationName;
export const DEV_SEED_USERS: readonly DevSeedUser[] = seed.users;

export const DEV_TOKENS: Record<string, string> = Object.fromEntries(
  DEV_SEED_USERS.map((user) => [user.key, user.token]),
);
