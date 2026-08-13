export * from "./client-messages.js";
export * from "./server-messages.js";

import {
  clientMessageSchema,
  type ClientMessage,
} from "./client-messages.js";
import {
  serverMessageSchema,
  type ServerMessage,
} from "./server-messages.js";

export function parseClientMessage(
  raw: string,
): ClientMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    const result = clientMessageSchema.safeParse(value);

    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

export function parseServerMessage(
  raw: string,
): ServerMessage | null {
  try {
    const value: unknown = JSON.parse(raw);
    const result = serverMessageSchema.safeParse(value);

    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

export function serializeServerMessage(
  message: ServerMessage,
): string {
  const result = serverMessageSchema.safeParse(message);

  if (!result.success) {
    throw new Error(
      `Invalid server message: ${result.error.message}`,
    );
  }

  return JSON.stringify(result.data);
}
