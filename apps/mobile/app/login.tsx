import { useEffect, useState } from 'react';
import { Link, Redirect, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEV_SEED_USERS } from '@d3-arcana/dev-auth';

import { useAuth } from '@/context/auth';
import { getApiBaseUrl } from '@/lib/config';

export default function LoginScreen() {
  const { user, signIn, isLoading, error } = useAuth();
  const [pending, setPending] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl);

  useEffect(() => {
    setApiBaseUrl(getApiBaseUrl());
  }, []);

  if (user) {
    return <Redirect href={'/(tabs)' as Href} />;
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>D3 Arcana</Text>
        <Text style={styles.subtitle}>
          Development sign-in using opaque bearer tokens.
        </Text>
        <Text style={styles.apiUrl}>API: {apiBaseUrl}</Text>
        <Text style={styles.hint}>
          This host comes from Metro (--lan). Restart Metro after a network
          change. Set EXPO_PUBLIC_API_URL only if you need to override it.
        </Text>

        {DEV_SEED_USERS.map((seedUser) => (
          <Pressable
            key={seedUser.key}
            style={styles.button}
            disabled={isLoading}
            onPress={() => handleSignIn(seedUser.token, seedUser.displayName)}>
            <Text style={styles.buttonText}>
              {pending === seedUser.displayName
                ? 'Signing in…'
                : `Sign in as ${seedUser.displayName}`}
            </Text>
          </Pressable>
        ))}

        <Link href={'/timeline-test' as Href} asChild>
          <Pressable style={StyleSheet.flatten([styles.button, styles.testButton])}>
            <Text style={styles.buttonText}>Timeline Test</Text>
          </Pressable>
        </Link>

        {isLoading ? <ActivityIndicator style={styles.spinner} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
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
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  testButton: {
    backgroundColor: '#334155',
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
