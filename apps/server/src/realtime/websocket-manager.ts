import { WebSocket } from "ws";

export class WebSocketManager {
  private readonly clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);

    socket.on("close", () => {
      this.clients.delete(socket);
    });
  }

  broadcast(message: unknown): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}