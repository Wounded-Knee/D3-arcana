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
| Redis | Loopback `127.0.0.1:6379`. LiveKit and Egress share it for worker registration. |
| MinIO (recordings) | API `0.0.0.0:9000` (console loopback `:9001`). The server writes via `OBJECT_STORE_ENDPOINT` (`127.0.0.1:9000`). Presigned playback URLs use `OBJECT_STORE_PUBLIC_ENDPOINT` or `http://<preferred-lan-ip>:9000`. |
| LiveKit Egress | Host-networked `livekit/egress`. Starts a per-microphone track file into the MinIO bucket. |

On **web**, `localhost` works when you open `http://localhost:8081` on the same PC.

For **LAN-wide web**, start with `pnpm --filter mobile web` (`--lan`) and open `http://<pc-lan-ip>:8081`. Dev CORS allows private-network origins on Metro ports 8081/19006.

## Start stack

```bash
# LiveKit SFU + Redis + Egress + MinIO (detects current LAN IP for phone ICE)
pnpm dev:livekit

# API (migrates, seeds Alice/Bob, then watches). LIVEKIT_PUBLIC_URL defaults to ws://<preferred-lan-ip>:7880
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

OBJECT_STORE_ENDPOINT=http://127.0.0.1:9000
# Optional. Omit to advertise http://<preferred-lan-ip>:9000 in presigned playback URLs.
# OBJECT_STORE_PUBLIC_ENDPOINT=http://192.168.1.50:9000
OBJECT_STORE_BUCKET=arcana-recordings
OBJECT_STORE_ACCESS_KEY=minio
OBJECT_STORE_SECRET_KEY=minio12345
OBJECT_STORE_REGION=us-east-1
OBJECT_STORE_FORCE_PATH_STYLE=true

EGRESS_INGEST_URL=ws://127.0.0.1:3000/internal/egress
EGRESS_INGEST_SECRET=dev-egress-secret
```

`LIVEKIT_URL` stays on loopback (server → LiveKit control plane on the same PC).

`pnpm dev:livekit` also starts Redis (`6379`), MinIO (`9000`/`9001`), and LiveKit Egress. Each published microphone is copied over a websocket to the API as 48 kHz stereo `s16le`, which is filed as **500ms WAV clips** in MinIO. Postgres stores the session plus fragment index. A clip is playable as soon as it is closed (~0.5s behind live). Recording is best-effort: a down MinIO/Egress does not block join. Failed and restored sessions emit `call.recording.failed` / `call.recording.restored`.

While someone scrubs the past, live remote audio is muted. **Return to live** plays missed clips at 1.75×, then rides 1× at the 0.5s ready edge. The API jumps that client to live WebRTC only after ~0.6s of group silence in the open buffer. **Jump to live** skips immediately and may clip a word.

Allow TCP 9000 from the phone and from LAN browsers. The console stays on loopback (`:9001`).

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

That prebuilds `apps/mobile/android/` (gitignored), compiles, `adb install`s, and starts Metro. Rebuild after native dependency or config-plugin changes (`run:android` again, or `expo prebuild --clean` then run). Timeline playback uses `expo-audio`; a JS reload is not enough after adding or upgrading it.

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

Allow TCP 3000, 7880, 7881, 9000 and UDP 55000–55020 from the phone on the host firewall.

### Verify (phone + web)

1. Sign in as Alice on the phone and Bob in a browser (or two phones).
2. Open the same conversation.
3. Join call → allow microphone → hear audio both ways.
4. Leave → call ends after grace period when empty.
5. The timeline stays mounted. Scrub, press play, or select a range. Solo a track from its label.

## Verify (web)

1. Sign in as Alice and Bob in two browser tabs.
2. Open the same conversation.
3. Join call → allow microphone → hear audio both ways.
4. Leave → call ends after grace period when empty.
5. The timeline stays mounted. Scrub, press play, or select a range. Solo a track from its label.
