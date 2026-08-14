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

export function inferDevHost(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    try {
      return new URL(process.env.EXPO_PUBLIC_API_URL).hostname;
    } catch {
      // fall through
    }
  }

  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  const fromDebugger = hostFromUri(debuggerHost);
  if (fromDebugger) {
    return fromDebugger;
  }

  const fromLinking = hostFromUri(Constants.linkingUri);
  if (fromLinking) {
    return fromLinking;
  }

  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return 'localhost';
}

export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? `http://${inferDevHost()}:3000`;
}

export function getWsBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_WS_URL ??
    getApiBaseUrl().replace(/^http/, 'ws') + '/ws'
  );
}

/** @deprecated Use getApiBaseUrl() — resolved lazily at call time. */
export const API_BASE_URL = getApiBaseUrl();

export const DEV_TOKENS = {
  alice: 'dev-alice',
  bob: 'dev-bob',
} as const;
