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
        `Could not reach server at ${apiBaseUrl}. Set EXPO_PUBLIC_API_URL to the same URL that works in the phone browser.`,
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

export async function pingHealth(): Promise<{ status: string }> {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetchWithTimeout(`${apiBaseUrl}/health`);

  if (!response.ok) {
    throw new ApiError(`Health check failed (${response.status})`, response.status);
  }

  return response.json() as Promise<{ status: string }>;
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
