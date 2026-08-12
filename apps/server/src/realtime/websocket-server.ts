import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

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

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "connection.ready",
        }),
      );
    }

    socket.on("error", (error) => {
      console.error("[ws] client error:", error);
    });
  });

  return wss;
}