import { useEffect, useState } from 'react';
import { Redirect, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { pingHealth } from '@/lib/api';
import { getApiBaseUrl, DEV_TOKENS } from '@/lib/config';

export default function LoginScreen() {
  const { user, signIn, isLoading, error } = useAuth();
  const [pending, setPending] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    setApiBaseUrl(getApiBaseUrl());
  }, []);

  if (user) {
    return <Redirect href={'/(tabs)' as Href} />;
  }

  async function handleTestConnection() {
    setHealthLoading(true);
    setHealthStatus(null);

    try {
      const result = await pingHealth();
      setHealthStatus(`OK — server responded: ${result.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Health check failed';
      setHealthStatus(`Failed — ${message}`);
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleSignIn(token: string, label: string) {
    setPending(label);
    try {
      await signIn(token);
    } catch {
      // Error state is handled in AuthProvider.
    } finally {
      setPending(null);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>D3 Arcana</Text>
      <Text style={styles.subtitle}>
        Development sign-in using opaque bearer tokens.
      </Text>
      <Text style={styles.apiUrl}>API: {apiBaseUrl}</Text>
      <Text style={styles.hint}>
        If this is not the same URL that worked in the phone browser, create
        apps/mobile/.env with EXPO_PUBLIC_API_URL set to that address.
      </Text>

      <Pressable
        style={styles.secondaryButton}
        disabled={healthLoading}
        onPress={() => void handleTestConnection()}>
        <Text style={styles.secondaryButtonText}>
          {healthLoading ? 'Testing…' : 'Test connection from app'}
        </Text>
      </Pressable>

      {healthStatus ? (
        <Text
          style={
            healthStatus.startsWith('OK')
              ? styles.healthOk
              : styles.healthError
          }>
          {healthStatus}
        </Text>
      ) : null}

      <Pressable
        style={styles.button}
        disabled={isLoading}
        onPress={() => handleSignIn(DEV_TOKENS.alice, 'Alice')}>
        <Text style={styles.buttonText}>
          {pending === 'Alice' ? 'Signing in…' : 'Sign in as Alice'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        disabled={isLoading}
        onPress={() => handleSignIn(DEV_TOKENS.bob, 'Bob')}>
        <Text style={styles.buttonText}>
          {pending === 'Bob' ? 'Signing in…' : 'Sign in as Bob'}
        </Text>
      </Pressable>

      {isLoading ? <ActivityIndicator style={styles.spinner} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 8,
  },
  apiUrl: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  hint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  secondaryButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  healthOk: {
    color: '#4ade80',
    fontSize: 13,
  },
  healthError: {
    color: '#f87171',
    fontSize: 13,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  spinner: {
    marginTop: 8,
  },
  error: {
    color: '#f87171',
    marginTop: 8,
  },
});
