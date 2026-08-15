# Media transport (dev)

Group audio calls use **LiveKit** (SFU) for media and the **Node API** for auth, call state, and chat notifications.

LAN IPs are detected at runtime. Do not bake `192.168.x.x` into `apps/mobile/.env`.

## Services

| Service | How the client finds it |
|---------|-------------------------|
| API + WebSocket | Metro packager host (`hostUri` / `debuggerHost`) on port 3000 |
| Metro | `expo start --lan` (`:8081`) |
| LiveKit signaling | Same Metro host on port 7880, or the join API URL if that is not loopback |
| LiveKit ICE (`node_ip`) | `pnpm dev:livekit` sets `--node-ip` from the PC default-route IPv4. The SFU uses Docker host networking so those ports bind on the PC, not Docker NAT. |

On **web**, `localhost` works when you open `http://localhost:8081` on the same PC.

For **LAN-wide web**, start with `pnpm --filter mobile web` (`--lan`) and open `http://<pc-lan-ip>:8081`. Dev CORS allows private-network origins on Metro ports 8081/19006.

## Start stack

```bash
# LiveKit SFU (detects current LAN IP for phone ICE)
pnpm dev:livekit

# Apply DB migrations (after schema changes)
pnpm --filter server db:migrate

# API (LIVEKIT_PUBLIC_URL defaults to ws://<preferred-lan-ip>:7880)
pnpm dev:server

# Web client (primary call testing — two browser tabs)
pnpm --filter mobile web

# Android development build (USB phone, LiveKit native modules):
#   pnpm --filter mobile run:android
```

## Server env

Add to `apps/server/.env` (see `docker/livekit/.env.example`):

```text
LIVEKIT_URL=http://127.0.0.1:7880
# Optional. Omit to advertise ws://<preferred-lan-ip>:7880 in join credentials.
# LIVEKIT_PUBLIC_URL=ws://192.168.1.50:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
LIVEKIT_WEBHOOK_SECRET=devsecret
CALL_EMPTY_GRACE_MS=45000
```

`LIVEKIT_URL` stays on loopback (server → LiveKit control plane on the same PC).

## Client env

`apps/mobile/.env` is optional. Metro `--lan` supplies the current PC IP for API and LiveKit. Restart Metro after the PC joins a new network.

Override only if inference is wrong:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
EXPO_PUBLIC_LIVEKIT_URL=ws://192.168.1.50:7880
```

## Android development build

Expo Go cannot load `@livekit/react-native`. Install a local debug APK with `expo-dev-client`, then keep Metro running for JS.

Prerequisites (one-time): Android Studio + SDK, USB debugging enabled. Prefer phone and PC on the same router Wi-Fi. Phone-as-hotspot works only after the native WebRTC hotspot patch (rebuilt APK).

### First install (compiles native code)

```bash
# Phone plugged in; add --device if more than one target is attached
pnpm --filter mobile run:android
```

That prebuilds `apps/mobile/android/` (gitignored), compiles, `adb install`s, and starts Metro. Rebuild after native dependency or config-plugin changes (`run:android` again, or `expo prebuild --clean` then run).

### Daily JS-only development

```bash
pnpm --filter mobile start:dev-client
```

Scan the QR code with the installed **mobile** app (not Expo Go), or press `a` if adb is connected. Use `pnpm start` / `pnpm dev:mobile` only for Expo Go chat testing.

### Phone audio (ICE)

`pnpm dev:livekit` writes the current default-route IPv4 to `docker/livekit/.env` as `LIVEKIT_NODE_IP` and runs the SFU with Docker **host networking** so ICE UDP is not Docker-NATed. Restart that stack after the PC's IP changes.

Confirm the LiveKit startup log shows `"nodeIP": "<your-lan-ip>"`, not `127.0.0.1`.

If join still fails with `could not establish pc connection` on a phone:

1. Rebuild the native APK (`pnpm --filter mobile run:android`). JS reload is not enough — Android WebRTC must enumerate the hotspot/tethering interface.
2. Do not rely on cellular/VPN for media. Signaling can use the LAN while ICE binds to `10.x` (cellular) and never reaches the PC.

Allow TCP 3000, 7880, 7881 and UDP 55000–55020 from the phone on the host firewall.

### Verify (phone + web)

1. Sign in as Alice on the phone and Bob in a browser (or two phones).
2. Open the same conversation.
3. Join call → allow microphone → hear audio both ways.
4. Leave → call ends after grace period when empty.

## Verify (web)

1. Sign in as Alice and Bob in two browser tabs.
2. Open the same conversation.
3. Join call → allow microphone → hear audio both ways.
4. Leave → call ends after grace period when empty.
