#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
source "$ROOT_DIR/apps/server/.env"
set +a

export ALICE_ID="$(
  psql "$DATABASE_URL" -Atc "
    SELECT id
    FROM users
    WHERE display_name = 'Alice'
    ORDER BY created_at
    LIMIT 1;
  "
)"

export BOB_ID="$(
  psql "$DATABASE_URL" -Atc "
    SELECT id
    FROM users
    WHERE display_name = 'Bob'
    ORDER BY created_at
    LIMIT 1;
  "
)"

export CONVERSATION_ID="$(
  psql "$DATABASE_URL" -Atc "
    SELECT id
    FROM conversations
    WHERE name = 'Bridge Discussion'
    ORDER BY created_at
    LIMIT 1;
  "
)"

export ALICE_TOKEN="dev-alice"
export BOB_TOKEN="dev-bob"

if [[ -z "$ALICE_ID" ]]; then
  echo "ERROR: Alice was not found. Run: pnpm --filter server db:seed" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ -z "$CONVERSATION_ID" ]]; then
  echo "ERROR: Bridge Discussion was not found. Run: pnpm --filter server db:seed" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ -z "${DEV_AUTH_TOKENS:-}" ]]; then
  echo "WARNING: DEV_AUTH_TOKENS is not set. Run: pnpm --filter server db:sync-auth" >&2
fi

echo "Development environment loaded:"
echo "  ALICE_ID=$ALICE_ID"
echo "  BOB_ID=${BOB_ID:-<not seeded>}"
echo "  CONVERSATION_ID=$CONVERSATION_ID"
echo "  ALICE_TOKEN=$ALICE_TOKEN"
echo "  BOB_TOKEN=$BOB_TOKEN"
echo ""
echo "Example:"
echo "  curl -H \"Authorization: Bearer $ALICE_TOKEN\" http://localhost:3000/api/v1/users/$ALICE_ID/conversations"
