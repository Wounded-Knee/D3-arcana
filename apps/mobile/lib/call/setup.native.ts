import { isExpoGo } from '@/lib/expo-go';

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
