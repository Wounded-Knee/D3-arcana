import {
  parseServerMessage,
  type ServerMessage,
} from "@d3-arcana/protocol";
import WebSocket from "ws";

export interface WsTestClient {
  ws: WebSocket;
  messages: ServerMessage[];
  send: (payload: unknown) => void;
  close: () => void;
}

export function connectWs(port: number): Promise<WsTestClient> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    ws.on("open", () => {
      resolve({
        ws,
        messages,
        send(payload: unknown) {
          ws.send(JSON.stringify(payload));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.on("message", (data) => {
      const message = parseServerMessage(data.toString());
      if (message) {
        messages.push(message);
      }
    });

    ws.on("error", reject);
  });
}

export async function waitForMessage(
  messages: ServerMessage[],
  predicate: (message: ServerMessage) => boolean,
  timeoutMs = 3_000,
): Promise<ServerMessage> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const match = messages.find(predicate);
    if (match) {
      return match;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for WebSocket message");
}
