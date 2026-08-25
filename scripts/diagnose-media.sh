#!/usr/bin/env bash
# Media stack diagnostics — run from repo root: ./scripts/diagnose-media.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}OK${NC}   $*"; }
fail() { echo -e "${RED}FAIL${NC} $*"; }
warn() { echo -e "${YELLOW}WARN${NC} $*"; }

http_code() {
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$1" 2>/dev/null)" || true
  if [[ -z "$code" || "$code" == "000" ]]; then
    echo "000"
  else
    echo "$code"
  fi
}

echo "=== Media transport diagnostics ==="
echo "LAN IP: ${LAN_IP:-unknown}"
echo ""

# --- LiveKit Docker ---
echo "--- LiveKit (Docker) ---"
inspect_livekit_cmd() {
  local runner=(docker)
  if ! docker info >/dev/null 2>&1; then
    runner=(sudo docker)
  fi
  "${runner[@]}" ps -a --filter name=livekit --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
  local cmd
  cmd="$("${runner[@]}" inspect livekit-livekit-1 --format '{{json .Config.Cmd}}' 2>/dev/null)" || true
  if [[ -z "$cmd" || "$cmd" == "null" ]]; then
    return
  fi
  echo "Container Cmd: $cmd"
  if echo "$cmd" | grep -q -- '127.0.0.1'; then
    fail "LiveKit --node-ip is 127.0.0.1 — phones cannot ICE. Restart: pnpm dev:livekit"
  elif echo "$cmd" | grep -q -- '--node-ip'; then
    ok "LiveKit command includes --node-ip (should be the PC LAN IP, not 127.0.0.1)"
  fi
}

if command -v docker >/dev/null 2>&1; then
  if docker ps -a --filter name=livekit --format '{{.Names}}' 2>/dev/null | grep -q livekit \
    || sudo docker ps -a --filter name=livekit --format '{{.Names}}' 2>/dev/null | grep -q livekit; then
    inspect_livekit_cmd
  else
    fail "Cannot query Docker (permission denied?). Run: sudo docker ps -a | grep livekit"
  fi
else
  fail "docker not installed"
fi

echo ""
echo "--- TCP listeners (7880 signaling, 7881 RTC TCP) ---"
if ss -tlnp 2>/dev/null | grep -E ':788[01]\s'; then
  ss -tlnp 2>/dev/null | grep -E ':788[01]\s' || true
else
  fail "Nothing listening on 7880/7881 — LiveKit not running or ports not published"
fi

echo ""
echo "--- HTTP reachability ---"
for url in "http://127.0.0.1:7880" "http://${LAN_IP}:7880"; do
  code="$(http_code "$url")"
  if [[ "$code" == "000" ]]; then
    fail "$url -> connection refused (LiveKit down?)"
  else
    ok "$url -> HTTP $code"
  fi
done

echo ""
echo "--- UDP RTC port range (55000-55020 dev default) ---"
conflict=0
for p in $(seq 55000 55020); do
  if ss -ulnp 2>/dev/null | grep -q ":$p "; then
    warn "UDP $p in use: $(ss -ulnp 2>/dev/null | grep ":$p ")"
    conflict=$((conflict + 1))
  fi
done
if [[ "$conflict" -eq 0 ]]; then
  ok "55000-55020 UDP range appears free on host"
else
  warn "$conflict ports in 55000-55020 already in use (may block docker compose up)"
fi

echo ""
echo "--- Legacy range 50000-50100 (browser WebRTC overlap) ---"
legacy=0
for p in $(seq 50000 50100); do
  ss -ulnp 2>/dev/null | grep -q ":$p " && legacy=$((legacy + 1)) || true
done
if [[ "$legacy" -gt 0 ]]; then
  warn "$legacy UDP ports in 50000-50100 in use (Firefox/Chrome WebRTC often uses these)"
else
  ok "50000-50100 mostly free"
fi

echo ""
echo "--- API server (3000) ---"
api_code="$(http_code "http://127.0.0.1:3000/health")"
if [[ "$api_code" == "200" ]]; then
  ok "http://127.0.0.1:3000/health -> $api_code"
else
  fail "http://127.0.0.1:3000/health -> $api_code (run: pnpm dev:server)"
fi

echo ""
echo "--- Metro web (8081) ---"
metro_code="$(http_code "http://127.0.0.1:8081")"
if [[ "$metro_code" == "000" ]]; then
  warn "http://127.0.0.1:8081 unreachable (run: pnpm --filter mobile web)"
else
  ok "http://127.0.0.1:8081 -> HTTP $metro_code"
fi

echo ""
echo "--- Env files ---"
if [[ -f apps/server/.env ]]; then
  echo "apps/server/.env LIVEKIT_*:"
  grep -E '^LIVEKIT' apps/server/.env || echo "  (none)"
  echo "  Expected LIVEKIT_URL=http://127.0.0.1:7880 (server control plane on same PC)"
else
  warn "apps/server/.env missing"
fi

if [[ -f apps/mobile/.env ]]; then
  echo "apps/mobile/.env EXPO_PUBLIC_*:"
  grep -E '^EXPO_PUBLIC' apps/mobile/.env || echo "  (none)"
else
  warn "apps/mobile/.env missing"
fi

echo ""
echo "=== Recommended start order ==="
echo "  1. pnpm dev:livekit"
echo "  2. pnpm dev:server"
echo "  3. pnpm --filter mobile web"
echo "  4. Open http://127.0.0.1:8081 (or http://${LAN_IP}:8081 from LAN)"
echo ""
echo "If docker compose fails on UDP ports, close browsers in calls or see docker/livekit/livekit.yaml port range."
