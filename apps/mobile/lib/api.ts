import { getApiBaseUrl } from './config';

export interface User {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface ConversationMember {
  id: string;
  displayName: string;
}

export interface ConversationDetail extends Conversation {
  members: ConversationMember[];
}

export interface MessageSender {
  id: string;
  displayName: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender?: MessageSender;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);

    fetch(url, options)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function request<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}${path}`;

  try {
    const response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const defaultMessage =
        typeof body.error === 'string' ? body.error : 'Request failed';

      throw new ApiError(
        response.status === 401
          ? 'Invalid bearer token. On the PC run: pnpm --filter server db:sync-auth then restart the server.'
          : defaultMessage,
        response.status,
        typeof body.code === 'string' ? body.code : undefined,
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : 'Network request failed';

    if (message.includes('timed out')) {
      throw new ApiError(
        `Could not reach server at ${apiBaseUrl}. Reload after Metro reconnects, or set EXPO_PUBLIC_API_URL only if you need to override the packager host.`,
        0,
        'network_timeout',
      );
    }

    throw new ApiError(
      `Network error contacting ${apiBaseUrl}: ${message}`,
      0,
      'network_error',
    );
  }
}

export type CheckStatus = 'ok' | 'error';

export interface DependencyCheck {
  status: CheckStatus;
  error?: string;
  time?: string;
}

export interface ReadyHealth {
  status: CheckStatus;
  database: DependencyCheck;
  livekit: DependencyCheck;
}

function isDependencyCheck(value: unknown): value is DependencyCheck {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const check = value as DependencyCheck;
  return check.status === 'ok' || check.status === 'error';
}

function isReadyHealth(value: unknown): value is ReadyHealth {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as ReadyHealth;
  return (
    (body.status === 'ok' || body.status === 'error') &&
    isDependencyCheck(body.database) &&
    isDependencyCheck(body.livekit)
  );
}

export async function fetchReadiness(): Promise<ReadyHealth> {
  const apiBaseUrl = getApiBaseUrl();

  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/health/ready`);
    const body: unknown = await response.json().catch(() => null);

    if (isReadyHealth(body)) {
      return body;
    }

    throw new ApiError(
      `Health check failed (${response.status})`,
      response.status,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : 'Network request failed';

    if (message.includes('timed out')) {
      throw new ApiError(
        `Could not reach server at ${apiBaseUrl}. Reload after Metro reconnects, or set EXPO_PUBLIC_API_URL only if you need to override the packager host.`,
        0,
        'network_timeout',
      );
    }

    throw new ApiError(
      `Network error contacting ${apiBaseUrl}: ${message}`,
      0,
      'network_error',
    );
  }
}

export async function fetchCurrentUser(token: string): Promise<User> {
  return request<User>(token, '/api/v1/me');
}

export async function fetchConversations(token: string): Promise<Conversation[]> {
  const data = await request<{ conversations: Conversation[] }>(
    token,
    '/api/v1/me/conversations',
  );

  return data.conversations;
}

export async function fetchConversation(
  token: string,
  conversationId: string,
): Promise<ConversationDetail> {
  return request<ConversationDetail>(
    token,
    `/api/v1/conversations/${conversationId}`,
  );
}

export async function fetchMessages(
  token: string,
  conversationId: string,
): Promise<Message[]> {
  const data = await request<{ messages: Message[]; hasMore: boolean }>(
    token,
    `/api/v1/conversations/${conversationId}/messages`,
  );

  return data.messages;
}

export async function sendMessage(
  token: string,
  conversationId: string,
  content: string,
): Promise<Message> {
  return request<Message>(
    token,
    `/api/v1/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
    },
  );
}

export type CallJoinRole = 'publisher' | 'subscriber';

export interface JoinCallResponse {
  callId: string;
  provider: 'livekit';
  url: string;
  token: string;
  expiresAt: string;
  role: CallJoinRole;
}

export interface ActiveCallParticipant {
  userId: string;
  role: CallJoinRole;
  displayName: string;
  joinedAt: string;
}

export interface ActiveCallResponse {
  call: {
    id: string;
    conversationId: string;
    startedBy: string;
    status: string;
    mediaMode: string;
    startedAt: string;
  };
  participants: ActiveCallParticipant[];
}

export async function joinCall(
  token: string,
  conversationId: string,
  role: CallJoinRole = 'publisher',
): Promise<JoinCallResponse> {
  return request<JoinCallResponse>(
    token,
    `/api/v1/conversations/${conversationId}/calls/join`,
    {
      method: 'POST',
      body: JSON.stringify({ role }),
    },
  );
}

export async function leaveCall(
  token: string,
  conversationId: string,
): Promise<void> {
  await request<void>(
    token,
    `/api/v1/conversations/${conversationId}/calls/leave`,
    {
      method: 'POST',
    },
  );
}

export async function fetchActiveCall(
  token: string,
  conversationId: string,
): Promise<ActiveCallResponse | null> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/v1/conversations/${conversationId}/calls/active`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        typeof body.error === 'string' ? body.error : 'Request failed',
        response.status,
      );
    }

    return body as ActiveCallResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      0,
      'network_error',
    );
  }
}

export interface CallTimelineSession {
  joinedAt: string;
  leftAt: string | null;
}

export interface CallTimelineChunk {
  startOffsetMs: number;
  sampleRateHz: number;
  amplitudes: number[];
}

export interface CallTimelineTrack {
  userId: string;
  displayName: string;
  sessions: CallTimelineSession[];
  chunks: CallTimelineChunk[];
}

export interface CallTimelineResponse {
  call: {
    id: string;
    startedAt: string;
  };
  tracks: CallTimelineTrack[];
}

export async function fetchCallTimeline(
  token: string,
  conversationId: string,
): Promise<CallTimelineResponse | null> {
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/v1/conversations/${conversationId}/calls/active/timeline`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        typeof body.error === 'string' ? body.error : 'Request failed',
        response.status,
      );
    }

    return body as CallTimelineResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      0,
      'network_error',
    );
  }
}

export async function postWaveform(
  token: string,
  conversationId: string,
  startOffsetMs: number,
  amplitudes: number[],
): Promise<void> {
  await request<void>(
    token,
    `/api/v1/conversations/${conversationId}/calls/waveform`,
    {
      method: 'POST',
      body: JSON.stringify({ startOffsetMs, amplitudes }),
    },
  );
}
