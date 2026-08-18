#!/usr/bin/env bash
# Per-boot reconciliation for the D3 Arcana Cloud Agent environment.
# Starts PostgreSQL, ensures the application role/database exist, writes the
# server .env if missing, and applies database migrations. Safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="d3_arcana"
DB_ROLE="d3_arcana_app"
DB_PASSWORD="d3_arcana_app"

PG_VERSION="$(ls /usr/lib/postgresql 2>/dev/null | sort -V | tail -1)"
if [ -z "${PG_VERSION}" ]; then
  echo "[start] PostgreSQL is not installed. Run the install step first." >&2
  exit 1
fi

if ! pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  echo "[start] Starting PostgreSQL ${PG_VERSION} cluster..."
  sudo pg_ctlcluster "${PG_VERSION}" main start
fi

echo "[start] Waiting for PostgreSQL to accept connections..."
for _ in $(seq 1 30); do
  if pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
    break
  fi
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432

echo "[start] Ensuring application role and database exist..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_ROLE}') THEN
    CREATE ROLE ${DB_ROLE} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_ROLE}" "${DB_NAME}"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_ROLE};" >/dev/null

if [ ! -f apps/server/.env ]; then
  echo "[start] Writing apps/server/.env..."
  cat > apps/server/.env <<ENV
DATABASE_URL=postgresql://${DB_ROLE}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
PORT=3000
ENV
fi

echo "[start] Applying database migrations..."
pnpm --filter server db:migrate

echo "[start] Ready."
