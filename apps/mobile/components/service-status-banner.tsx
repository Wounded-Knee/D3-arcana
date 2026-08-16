import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, fetchReadiness, type ReadyHealth } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/config';

const POLL_INTERVAL_MS = 30_000;

function describeReady(ready: ReadyHealth): string | null {
  if (ready.status === 'ok') {
    return null;
  }

  const databaseDown = ready.database.status !== 'ok';
  const livekitDown = ready.livekit.status !== 'ok';

  if (databaseDown && livekitDown) {
    return 'Database and LiveKit are unavailable.';
  }

  if (databaseDown) {
    return 'Database unavailable.';
  }

  return "LiveKit unavailable — calls won't work.";
}

export function ServiceStatusBanner() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const ready = await fetchReadiness();
      setMessage(describeReady(ready));
    } catch (error) {
      const detail =
        error instanceof ApiError
          ? error.message
          : `Cannot reach API at ${getApiBaseUrl()}`;
      setMessage(detail);
    }
  }, []);

  useEffect(() => {
    void check();

    const interval = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [check]);

  if (!message) {
    return null;
  }

  return (
    <Text
      style={[styles.banner, { paddingTop: Math.max(insets.top, 10) }]}
      accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#7f1d1d',
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    textAlign: 'center',
  },
});
