export type ClientMessage =
  | {
      type: "conversation.join";
      conversationId: string;
    }
  | {
      type: "conversation.leave";
      conversationId: string;
    };

export function parseClientMessage(
  raw: string,
): ClientMessage | null {
  try {
    const message: unknown = JSON.parse(raw);

    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message)
    ) {
      return null;
    }

    if (
      message.type === "conversation.join" ||
      message.type === "conversation.leave"
    ) {
      if (
        "conversationId" in message &&
        typeof message.conversationId === "string" &&
        message.conversationId.length > 0
      ) {
        return message as ClientMessage;
      }
    }

    return null;
  } catch {
    return null;
  }
}