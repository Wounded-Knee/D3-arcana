import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

import { parseClientMessage } from "./protocol.js";
import { WebSocketManager } from "./websocket-manager.js";

export function createWebSocketServer(
  server: HttpServer,
  manager: WebSocketManager,
) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
  });

  wss.on("connection", (socket) => {
    console.log("[ws] client connected");

    manager.add(socket);

    socket.send(
      JSON.stringify({
        type: "connection.ready",
      }),
    );

    socket.on("message", (data) => {
      const message = parseClientMessage(
        data.toString(),
      );

      if (!message) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: "Invalid WebSocket message",
          }),
        );

        return;
      }

      switch (message.type) {
        case "conversation.join":
          manager.subscribe(
            socket,
            message.conversationId,
          );

          socket.send(
            JSON.stringify({
              type: "conversation.joined",
              conversationId: message.conversationId,
            }),
          );

          console.log(
            `[ws] client joined ${message.conversationId}`,
          );

          break;

        case "conversation.leave":
          manager.unsubscribe(
            socket,
            message.conversationId,
          );

          socket.send(
            JSON.stringify({
              type: "conversation.left",
              conversationId: message.conversationId,
            }),
          );

          console.log(
            `[ws] client left ${message.conversationId}`,
          );

          break;
      }
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