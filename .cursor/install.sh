#!/usr/bin/env bash
# Idempotent repository bootstrap for the D3 Arcana Cloud Agent environment.
# Installs the one missing system dependency (PostgreSQL) and refreshes
# workspace dependencies against the committed lockfile.
set -euo pipefail

cd "$(dirname "$0")/.."

# PostgreSQL is required by apps/server but is not part of the default image.
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "[install] Installing PostgreSQL..."
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
else
  echo "[install] PostgreSQL already present; skipping apt install."
fi

echo "[install] Installing workspace dependencies with pnpm..."
pnpm install --frozen-lockfile

echo "[install] Done."
