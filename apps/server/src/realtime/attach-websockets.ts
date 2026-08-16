import type { Server as HttpServer } from "node:http";

import { createEgressIngestServer } from "./egress-ingest.js";
import { EGRESS_INGEST_PATH } from "./egress-ingest-config.js";
import { createWebSocketServer } from "./websocket-server.js";
import type { WebSocketManager } from "./websocket-manager.js";

export function attachWebSocketServers(
  server: HttpServer,
  manager: WebSocketManager,
): void {
  const chat = createWebSocketServer(manager);
  const ingest = createEgressIngestServer(manager);

  server.on("upgrade", (request, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname === "/ws") {
      chat.handleUpgrade(request, socket, head, (websocket) => {
        chat.emit("connection", websocket, request);
      });
      return;
    }

    if (pathname === EGRESS_INGEST_PATH) {
      ingest.handleUpgrade(request, socket, head, (websocket) => {
        ingest.emit("connection", websocket, request);
      });
      return;
    }

    socket.destroy();
  });
}
