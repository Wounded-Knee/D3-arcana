import { isExpoGo } from '@/lib/expo-go';

/**
 * Hermes has no DOMException. livekit-client and @livekit/react-native
 * reference it at import time, so this must run before those modules load.
 */
if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'Error';
    }
  } as typeof DOMException;
}

/**
 * LiveKit RN globals — only for dev/standalone builds.
 * Expo Go has no @livekit/react-native native module; skip to avoid crash on launch.
 */
if (!isExpoGo()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerGlobals } = require('@livekit/react-native') as typeof import('@livekit/react-native');
    registerGlobals();
  } catch (error) {
    console.warn('[call] LiveKit native setup skipped:', error);
  }
}
