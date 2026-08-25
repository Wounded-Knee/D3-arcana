#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
source "$ROOT_DIR/apps/server/.env"
set +a

TEST_DB_NAME="${TEST_DB_NAME:-d3_arcana_test}"

if psql "$DATABASE_URL" -Atc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}';" | grep -q 1; then
  echo "Test database ${TEST_DB_NAME} already exists."
else
  echo "Creating test database ${TEST_DB_NAME}..."
  if ! psql "$DATABASE_URL" -c "CREATE DATABASE ${TEST_DB_NAME};" 2>/dev/null; then
    echo ""
    echo "Could not create ${TEST_DB_NAME} with the application role."
    echo "Create it manually as a superuser, for example:"
    echo "  sudo -u postgres createdb -O d3_arcana_app ${TEST_DB_NAME}"
    echo ""
    echo "Or set TEST_DATABASE_URL to an existing database in apps/server/.env."
    echo "Tests fall back to DATABASE_URL when TEST_DATABASE_URL is unset."
    exit 1
  fi
fi

BASE_URL="${DATABASE_URL%/*}"
export TEST_DATABASE_URL="${BASE_URL}/${TEST_DB_NAME}"

echo "Running migrations against ${TEST_DATABASE_URL}..."
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter server db:migrate

echo ""
echo "Add to apps/server/.env if not already present:"
echo "TEST_DATABASE_URL=${TEST_DATABASE_URL}"
