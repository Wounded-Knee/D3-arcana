import Constants from 'expo-constants';
import { Platform } from 'react-native';

function hostFromUri(uri: string | undefined): string | null {
  if (!uri) {
    return null;
  }

  const normalized = uri.replace(/^exp:\/\//, 'http://').replace(/^ws:\/\//, 'http://');
  try {
    return new URL(normalized).hostname;
  } catch {
    const withoutScheme = uri.replace(/^[a-z]+:\/\//, '');
    const host = withoutScheme.split(':')[0]?.split('/')[0];
    return host || null;
  }
}

function hostFromEnvUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string | null | undefined): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Packager host the app actually connected to (current PC LAN IP with --lan). */
export function getMetroHost(): string | null {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  return hostFromUri(debuggerHost) ?? hostFromUri(Constants.linkingUri);
}

export function inferDevHost(): string {
  const metroHost = getMetroHost();
  if (metroHost) {
    return metroHost;
  }

  const fromApiEnv = hostFromEnvUrl(process.env.EXPO_PUBLIC_API_URL);
  if (fromApiEnv) {
    return fromApiEnv;
  }

  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return 'localhost';
}

export function getApiBaseUrl(): string {
  const metroHost = getMetroHost();
  if (metroHost) {
    return `http://${metroHost}:3000`;
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  return `http://${inferDevHost()}:3000`;
}

export function getWsBaseUrl(): string {
  const metroHost = getMetroHost();
  if (metroHost) {
    return `ws://${metroHost}:3000/ws`;
  }

  return (
    process.env.EXPO_PUBLIC_WS_URL ??
    getApiBaseUrl().replace(/^http/, 'ws') + '/ws'
  );
}

export function getLiveKitUrl(): string {
  const metroHost = getMetroHost();
  if (metroHost) {
    return `ws://${metroHost}:7880`;
  }

  if (process.env.EXPO_PUBLIC_LIVEKIT_URL) {
    return process.env.EXPO_PUBLIC_LIVEKIT_URL;
  }

  return `ws://${inferDevHost()}:7880`;
}

/** Prefer Metro/LAN host; use the join API URL when it is not loopback. */
export function resolveCallMediaUrl(issuedUrl: string): string {
  const inferred = getLiveKitUrl();
  if (!isLoopbackHost(hostFromUri(inferred))) {
    return inferred;
  }

  if (!isLoopbackHost(hostFromUri(issuedUrl))) {
    return issuedUrl;
  }

  return inferred;
}

/** @deprecated Use getApiBaseUrl() — resolved lazily at call time. */
export const API_BASE_URL = getApiBaseUrl();

export const DEV_TOKENS = {
  alice: 'dev-alice',
  bob: 'dev-bob',
} as const;
