import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

import { PcmFragmentBuffer } from "../calls/pcm-fragment-buffer.js";
import {
  isSilentPcm,
  silenceWatchForCall,
} from "../calls/pcm-silence.js";
import { getCallById } from "../repositories/calls.js";
import { persistPcmFragment } from "../calls/persist-fragment.js";
import { getRecordingById } from "../repositories/recordings.js";
import { FRAGMENT_DURATION_MS } from "../storage/types.js";
import { fragmentByteLength } from "../storage/wav.js";
import { loadEgressIngestSecret } from "./egress-ingest-config.js";
import type { WebSocketManager } from "./websocket-manager.js";

const fragmentBytes = fragmentByteLength(FRAGMENT_DURATION_MS);

export function createEgressIngestServer(
  manager: WebSocketManager,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket, request) => {
    void handleConnection(socket, request, manager).catch((error: unknown) => {
      console.error("[egress-ingest] connection failed:", error);
      socket.close(1011, "ingest error");
    });
  });

  return wss;
}

async function handleConnection(
  socket: WebSocket,
  request: IncomingMessage,
  manager: WebSocketManager,
): Promise<void> {
  const pending: { data: Buffer; binary: boolean }[] = [];
  let onMessage:
    | ((data: Buffer, binary: boolean) => void)
    | null = null;

  socket.on("message", (data, isBinary) => {
    const buffer = toNodeBuffer(data);
    const binary = isBinary || looksLikePcm(buffer);
    if (onMessage) {
      onMessage(buffer, binary);
      return;
    }

    pending.push({ data: buffer, binary });
  });

  const params = parseIngestParams(request.url);
  const expected = loadEgressIngestSecret();

  if (!expected || !params || params.secret !== expected) {
    socket.close(4401, "unauthorized");
    return;
  }

  const recording = await getRecordingById(params.recordingId);
  if (
    !recording ||
    recording.callId !== params.callId ||
    recording.providerTrackSid !== params.trackSid ||
    (recording.status !== "starting" && recording.status !== "recording")
  ) {
    socket.close(4404, "recording not found");
    return;
  }

  const call = await getCallById(recording.callId);
  const callStartedAtMs = call?.startedAt.getTime() ?? Date.now();
  const buffer = new PcmFragmentBuffer(fragmentBytes);
  let nextOffsetMs = recording.callOffsetMs;
  const watch = silenceWatchForCall(recording.callId);
  watch.update(recording.providerTrackSid, { muted: false, silent: true });

  const flushPcm = async (pcm: Buffer): Promise<void> => {
    if (pcm.length === 0) {
      return;
    }

    const persisted = await persistPcmFragment({
      recording,
      pcm,
      callOffsetMs: nextOffsetMs,
      manager,
    });
    nextOffsetMs += persisted.durationMs;
  };

  onMessage = (pcm, binary) => {
    if (!binary) {
      const muted = parseMutedFrame(pcm.toString());
      if (muted !== null) {
        watch.update(recording.providerTrackSid, { muted });
        maybeBroadcastSafeJoin(
          manager,
          recording.conversationId,
          recording.callId,
          Math.max(0, Date.now() - callStartedAtMs),
        );
      }
      return;
    }

    watch.update(recording.providerTrackSid, {
      silent: isSilentPcm(pcm),
      muted: false,
    });
    maybeBroadcastSafeJoin(
      manager,
      recording.conversationId,
      recording.callId,
      Math.max(0, Date.now() - callStartedAtMs),
    );

    const ready = buffer.append(pcm);
    for (const chunk of ready) {
      void flushPcm(chunk).catch((error: unknown) => {
        console.error("[egress-ingest] failed to flush fragment:", error);
      });
    }
  };

  for (const item of pending) {
    onMessage(item.data, item.binary);
  }

  socket.on("close", () => {
    watch.remove(recording.providerTrackSid);
    const remainder = buffer.flushRemainder();
    if (remainder) {
      void flushPcm(remainder).catch((error: unknown) => {
        console.error("[egress-ingest] failed to flush remainder:", error);
      });
    }
  });
}

function maybeBroadcastSafeJoin(
  manager: WebSocketManager,
  conversationId: string,
  callId: string,
  atCallOffsetMs: number,
): void {
  const watch = silenceWatchForCall(callId);
  if (!watch.shouldJoinLive()) {
    return;
  }

  manager.broadcastToConversation(conversationId, {
    type: "call.catchup.safeToJoinLive",
    conversationId,
    callId,
    atCallOffsetMs,
  });
}

function parseIngestParams(url: string | undefined): {
  secret: string;
  recordingId: string;
  callId: string;
  trackSid: string;
} | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, "http://127.0.0.1");
    const secret = parsed.searchParams.get("secret");
    const recordingId = parsed.searchParams.get("recordingId");
    const callId = parsed.searchParams.get("callId");
    const trackSid = parsed.searchParams.get("trackSid");
    if (!secret || !recordingId || !callId || !trackSid) {
      return null;
    }

    return { secret, recordingId, callId, trackSid };
  } catch {
    return null;
  }
}

function toNodeBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  return Buffer.from(data as ArrayBuffer);
}

function looksLikePcm(buffer: Buffer): boolean {
  return buffer.length > 0 && buffer[0] !== 0x7b;
}

function parseMutedFrame(raw: string): boolean | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "muted" in value &&
      typeof (value as { muted: unknown }).muted === "boolean"
    ) {
      return (value as { muted: boolean }).muted;
    }
  } catch {
    return null;
  }

  return null;
}
