# @d3-arcana/protocol

Shared WebSocket wire format for D3 Arcana clients and server.

Protocol version: **1**

## Connection flow

1. Client connects to `/ws`.
2. Server sends `connection.ready`.
3. Client sends `auth.authenticate` with an opaque bearer token.
4. Server responds with `auth.authenticated` or `error` (then closes on failure).
5. Client may send `conversation.join` / `conversation.leave` (requires membership).
6. Server pushes domain events to subscribed clients as wrapped `event` messages.

## Client → server messages

| `type` | Fields |
| --- | --- |
| `auth.authenticate` | `token: string` |
| `conversation.join` | `conversationId: uuid` |
| `conversation.leave` | `conversationId: uuid` |

## Server → client messages

| `type` | Fields |
| --- | --- |
| `connection.ready` | `protocolVersion: 1`, `authenticated: boolean` |
| `auth.authenticated` | `userId: uuid`, `displayName: string` |
| `conversation.joined` | `conversationId: uuid` |
| `conversation.left` | `conversationId: uuid` |
| `error` | `code: ErrorCode`, `error: string` |
| `event` | `event: DomainEvent` |

### Error codes

- `invalid_message` — malformed or unrecognized client message
- `not_authenticated` — action requires prior `auth.authenticate`
- `authentication_failed` — token rejected or socket already authenticated
- `not_a_member` — caller is not a member of the conversation

### Domain events (inside `event`)

Domain events use the same envelope as `@d3-arcana/events`, wrapped for transport:

```json
{
  "type": "event",
  "event": {
    "eventId": "...",
    "type": "message.created",
    "timestamp": "...",
    "conversationId": "...",
    "actorId": "...",
    "payload": {
      "messageId": "...",
      "content": "..."
    }
  }
}
```

Currently supported event types: `message.created`.
