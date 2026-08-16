import { WebSocketServer, WebSocket } from "ws";

import {
  PROTOCOL_VERSION,
  parseClientMessage,
  serializeServerMessage,
  type ErrorCode,
  type ServerMessage,
} from "@d3-arcana/protocol";

import { authenticator } from "../auth/authenticator-instance.js";
import { isConversationMember } from "../repositories/conversations.js";
import { WebSocketManager } from "./websocket-manager.js";

function sendServerMessage(
  socket: WebSocket,
  message: ServerMessage,
): void {
  try {
    socket.send(serializeServerMessage(message));
  } catch (error) {
    console.error("[ws] invalid outbound message:", error);
  }
}

function sendError(
  socket: WebSocket,
  code: ErrorCode,
  error: string,
): void {
  sendServerMessage(socket, {
    type: "error",
    code,
    error,
  });
}

export function createWebSocketServer(manager: WebSocketManager) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    console.log("[ws] client connected");

    manager.add(socket);

    sendServerMessage(socket, {
      type: "connection.ready",
      protocolVersion: PROTOCOL_VERSION,
      authenticated: false,
    });

    socket.on("message", (data) => {
      void handleMessage(socket, manager, data.toString());
    });

    socket.on("close", () => {
      console.log("[ws] client disconnected");
    });

    socket.on("error", (error) => {
      console.error("[ws] client error:", error);
    });
  });

  return wss;
}

async function handleMessage(
  socket: WebSocket,
  manager: WebSocketManager,
  raw: string,
): Promise<void> {
  const message = parseClientMessage(raw);

  if (!message) {
    sendError(socket, "invalid_message", "Invalid WebSocket message");
    return;
  }

  switch (message.type) {
    case "auth.authenticate": {
      if (manager.getAuthenticatedUser(socket)) {
        sendError(
          socket,
          "authentication_failed",
          "Socket is already authenticated",
        );
        socket.close();
        return;
      }

      const user = await authenticator.authenticate(message.token);

      if (!user) {
        sendError(
          socket,
          "authentication_failed",
          "Invalid authentication token",
        );
        socket.close();
        return;
      }

      manager.setAuthenticatedUser(socket, user);

      sendServerMessage(socket, {
        type: "auth.authenticated",
        userId: user.userId,
        displayName: user.displayName,
      });

      console.log(`[ws] client authenticated as ${user.userId}`);
      return;
    }

    case "conversation.join": {
      const user = manager.getAuthenticatedUser(socket);

      if (!user) {
        sendError(
          socket,
          "not_authenticated",
          "Authentication required before joining a conversation",
        );
        return;
      }

      const isMember = await isConversationMember(
        message.conversationId,
        user.userId,
      );

      if (!isMember) {
        sendError(
          socket,
          "not_a_member",
          "Not a member of this conversation",
        );
        return;
      }

      manager.subscribe(socket, message.conversationId);

      sendServerMessage(socket, {
        type: "conversation.joined",
        conversationId: message.conversationId,
      });

      console.log(
        `[ws] client ${user.userId} joined ${message.conversationId}`,
      );
      return;
    }

    case "conversation.leave": {
      const user = manager.getAuthenticatedUser(socket);

      if (!user) {
        sendError(
          socket,
          "not_authenticated",
          "Authentication required before leaving a conversation",
        );
        return;
      }

      manager.unsubscribe(socket, message.conversationId);

      sendServerMessage(socket, {
        type: "conversation.left",
        conversationId: message.conversationId,
      });

      console.log(
        `[ws] client ${user.userId} left ${message.conversationId}`,
      );
      return;
    }
  }
}
