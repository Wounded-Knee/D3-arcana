#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
source "$ROOT_DIR/apps/server/.env"
set +a

eval "$(node "$ROOT_DIR/scripts/dev-users.mjs" --shell)"

first_key=""
for key in $DEV_SEED_KEYS; do
  key_upper="${key^^}"
  display_var="${key_upper}_DISPLAY_NAME"
  display_name="${!display_var}"
  id="$(
    psql "$DATABASE_URL" -Atc "
      SELECT id
      FROM users
      WHERE display_name = '${display_name//\'/\'\'}'
      ORDER BY created_at
      LIMIT 1;
    "
  )"
  export "${key_upper}_ID=$id"

  if [[ -z "$first_key" ]]; then
    first_key="$key"
    if [[ -z "$id" ]]; then
      echo "ERROR: ${display_name} was not found. Run: pnpm --filter server db:seed" >&2
      return 1 2>/dev/null || exit 1
    fi
  elif [[ -z "$id" ]]; then
    echo "WARNING: ${display_name} was not found. Run: pnpm --filter server db:seed" >&2
  fi
done

export CONVERSATION_ID="$(
  psql "$DATABASE_URL" -Atc "
    SELECT id
    FROM conversations
    WHERE name = '${DEV_CONVERSATION_NAME//\'/\'\'}'
    ORDER BY created_at
    LIMIT 1;
  "
)"

if [[ -z "$CONVERSATION_ID" ]]; then
  echo "ERROR: ${DEV_CONVERSATION_NAME} was not found. Run: pnpm --filter server db:seed" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ -z "${DEV_AUTH_TOKENS:-}" ]]; then
  echo "WARNING: DEV_AUTH_TOKENS is not set. Run: pnpm --filter server db:sync-auth" >&2
fi

echo "Development environment loaded:"
for key in $DEV_SEED_KEYS; do
  key_upper="${key^^}"
  id_var="${key_upper}_ID"
  token_var="${key_upper}_TOKEN"
  echo "  ${id_var}=${!id_var:-<not seeded>}"
  echo "  ${token_var}=${!token_var}"
done
echo "  CONVERSATION_ID=$CONVERSATION_ID"
echo ""
echo "Example:"
echo "  curl -H \"Authorization: Bearer $ALICE_TOKEN\" http://localhost:3000/api/v1/users/$ALICE_ID/conversations"
