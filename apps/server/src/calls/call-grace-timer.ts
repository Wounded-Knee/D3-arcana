import {
  countActiveParticipants,
  endCall,
  getCallById,
} from "../repositories/calls.js";
import { getMediaSessionProvider } from "../media/media-provider-instance.js";

const DEFAULT_GRACE_MS = 45_000;

function graceMs(): number {
  const raw = process.env.CALL_EMPTY_GRACE_MS;
  if (!raw) {
    return DEFAULT_GRACE_MS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_GRACE_MS;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function cancelEmptyRoomGrace(callId: string): void {
  const timer = timers.get(callId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(callId);
  }
}

export function scheduleEmptyRoomGrace(callId: string): void {
  if (timers.has(callId)) {
    return;
  }

  const timeout = setTimeout(async () => {
    timers.delete(callId);
    await finalizeEmptyCall(callId);
  }, graceMs());

  timers.set(callId, timeout);
}

export function resetEmptyRoomGraceForTests(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }

  timers.clear();
}

async function finalizeEmptyCall(callId: string): Promise<void> {
  const call = await getCallById(callId);
  if (!call || call.status !== "active") {
    return;
  }

  const activeCount = await countActiveParticipants(callId);
  if (activeCount > 0) {
    return;
  }

  const ended = await endCall(callId, call.startedBy, "empty_room");
  if (!ended) {
    return;
  }

  try {
    await getMediaSessionProvider().endRoom(callId);
  } catch (error) {
    console.error(`[call-grace] failed to end LiveKit room ${callId}:`, error);
  }
}

export async function maybeScheduleGraceAfterLeave(
  callId: string,
): Promise<void> {
  const call = await getCallById(callId);
  if (!call || call.status !== "active") {
    return;
  }

  const activeCount = await countActiveParticipants(callId);
  if (activeCount === 0) {
    scheduleEmptyRoomGrace(callId);
  }
}
