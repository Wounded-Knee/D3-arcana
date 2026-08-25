#!/usr/bin/env bash
# Start LiveKit and advertise the PC's current default-route IPv4 as node_ip
# so LAN phones can receive ICE candidates after DHCP changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker/livekit/docker-compose.yml"
# Compose interpolates ${LIVEKIT_NODE_IP} from this file. sudo on this host
# ignores -E (secure_path / env_reset), so a shell export never reaches Compose.
ENV_FILE="$ROOT/docker/livekit/.env"

detect_lan_ip() {
  local ip
  ip="$(ip -4 route get 1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  if [[ -n "${ip:-}" ]]; then
    echo "$ip"
    return
  fi

  hostname -I 2>/dev/null | awk '{
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^192\.168\./) { print $i; exit }
    }
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^10\./) { print $i; exit }
    }
    if (NF > 0) print $1
  }'
}

LAN_IP="$(detect_lan_ip)"
if [[ -z "${LAN_IP}" ]]; then
  echo "WARN: could not detect LAN IP; LiveKit will advertise 127.0.0.1" >&2
  LAN_IP="127.0.0.1"
fi

export LIVEKIT_NODE_IP="$LAN_IP"
if [[ -f "$ENV_FILE" ]]; then
  grep -v '^LIVEKIT_NODE_IP=' "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  printf 'LIVEKIT_NODE_IP=%s\n' "$LIVEKIT_NODE_IP" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
else
  printf 'LIVEKIT_NODE_IP=%s\n' "$LIVEKIT_NODE_IP" > "$ENV_FILE"
fi
echo "LiveKit node_ip=${LIVEKIT_NODE_IP}"

COMPOSE=(docker compose -f "$COMPOSE_FILE" up "$@")

if docker info >/dev/null 2>&1; then
  exec "${COMPOSE[@]}"
fi

echo "Docker socket not writable; retrying with sudo (node_ip via ${ENV_FILE})"
exec sudo "${COMPOSE[@]}"
