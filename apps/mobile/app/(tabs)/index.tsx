import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, Redirect, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import {
  fetchConversations,
  type Conversation,
} from '@/lib/api';

export default function ConversationsScreen() {
  const { user, token, signOut, realtime } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeCalls, setActiveCalls] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!token || !user) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const items = await fetchConversations(token);
      setConversations(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!realtime) {
      return;
    }

    return realtime.onEvent((event) => {
      switch (event.type) {
        case 'call.started':
          setActiveCalls((current) => {
            const next = new Set(current);
            next.add(event.conversationId);
            return next;
          });
          break;
        case 'call.ended':
          setActiveCalls((current) => {
            const next = new Set(current);
            next.delete(event.conversationId);
            return next;
          });
          break;
        default:
          break;
      }
    });
  }, [realtime]);

  if (!user || !token) {
    return <Redirect href={'/login' as Href} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Conversations</Text>
          <Text style={styles.subtitle}>Signed in as {user.displayName}</Text>
        </View>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.centered} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No conversations yet.</Text>
          }
          renderItem={({ item }) => (
            <Link href={`/conversation/${item.id}` as Href} asChild>
              <Pressable style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {activeCalls.has(item.id) ? (
                  <Text style={styles.callActive}>Call active</Text>
                ) : null}
                <Text style={styles.cardMeta}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 4,
  },
  signOut: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  callActive: {
    color: '#4ade80',
    fontWeight: '600',
    marginTop: 4,
  },
  cardMeta: {
    color: '#94a3b8',
    marginTop: 6,
  },
  centered: {
    marginTop: 40,
  },
  empty: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 40,
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
  },
});
