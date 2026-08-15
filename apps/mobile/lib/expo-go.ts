import Constants from 'expo-constants';

/** True when running inside the Expo Go store app (no custom native modules). */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/** True when a dev client / standalone build with native modules is available. */
export function supportsNativeCalls(): boolean {
  return !isExpoGo();
}
