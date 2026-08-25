#!/usr/bin/env bash
# Connect ADB to the tethered phone.
# Run:  ./scripts/adbconnect.sh
# Or:   source ./scripts/adbconnect.sh   # also exports PHONE_IP in this shell
#
# Override: PHONE_IP=10.8.173.165 ./scripts/adbconnect.sh
#           PHONE_IP=192.168.166.247:37123 ./scripts/adbconnect.sh
set -euo pipefail

detect_phone_ip() {
  # USB- or Wi-Fi-tethered, the phone is this PC's default IPv4 gateway.
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{
    for (i = 1; i <= NF; i++) if ($i == "via") { print $(i + 1); exit }
  }'
}

find_adb() {
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return
  fi
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  if [[ -x "$sdk/platform-tools/adb" ]]; then
    echo "$sdk/platform-tools/adb"
    return
  fi
  return 1
}

if [[ -z "${PHONE_IP:-}" ]]; then
  PHONE_IP="$(detect_phone_ip)"
fi
export PHONE_IP

if [[ -z "$PHONE_IP" ]]; then
  echo "ERROR: could not determine phone IP (no default IPv4 gateway). Set PHONE_IP and retry." >&2
  return 1 2>/dev/null || exit 1
fi

if ! ADB="$(find_adb)"; then
  echo "ERROR: adb not found. Install platform-tools or set ANDROID_HOME." >&2
  return 1 2>/dev/null || exit 1
fi

if [[ "$PHONE_IP" == *:* ]]; then
  ADB_TARGET="$PHONE_IP"
else
  ADB_TARGET="${PHONE_IP}:${ADB_PORT:-5555}"
fi

echo "PHONE_IP=$PHONE_IP"
echo "adb connect $ADB_TARGET"

"$ADB" start-server >/dev/null
"$ADB" connect "$ADB_TARGET"
"$ADB" devices -l
