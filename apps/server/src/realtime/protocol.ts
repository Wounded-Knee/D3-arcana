import {
    clientMessageSchema,
    type ClientMessage,
  } from "./schemas.js";
  
  export function parseClientMessage(
    raw: string,
  ): ClientMessage | null {
    try {
      const value: unknown = JSON.parse(raw);
  
      const result =
        clientMessageSchema.safeParse(value);
  
      if (!result.success) {
        return null;
      }
  
      return result.data;
    } catch {
      return null;
    }
  }