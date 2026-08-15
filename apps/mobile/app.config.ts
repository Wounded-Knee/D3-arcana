import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * expo-dev-client is incompatible with Expo Go (QR scan bounces to home).
 * Enable only for native dev builds: pnpm --filter mobile run:android
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = [...(config.plugins ?? [])];

  if (process.env.EXPO_USE_DEV_CLIENT === '1') {
    const hasDevClient = plugins.some(
      (plugin) =>
        plugin === 'expo-dev-client' ||
        (Array.isArray(plugin) && plugin[0] === 'expo-dev-client'),
    );

    if (!hasDevClient) {
      plugins.splice(1, 0, 'expo-dev-client');
    }
  }

  return {
    ...config,
    plugins,
  } as ExpoConfig;
};
