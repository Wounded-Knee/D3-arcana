import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import {
  fetchConversation,
  fetchMessages,
  sendMessage,
  type Message,
} from '@/lib/api';

function resolveSenderName(
  message: Message,
  currentUserId: string,
  memberNames: Map<string, string>,
): string {
  if (message.sender?.displayName) {
    return message.sender.displayName;
  }

  const cached = memberNames.get(message.senderId);
  if (cached) {
    return cached;
  }

  return message.senderId === currentUserId ? 'You' : 'Unknown';
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, token, realtime } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationId = id ?? '';

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  const loadMessages = useCallback(async () => {
    if (!token || !conversationId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [items, conversation] = await Promise.all([
        fetchMessages(token, conversationId),
        fetchConversation(token, conversationId),
      ]);
      setMessages(items);
      setMemberNames(
        new Map(conversation.members.map((member) => [member.id, member.displayName])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, token]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!realtime || !conversationId) {
      return;
    }

    realtime.joinConversation(conversationId);

    return realtime.onEvent((event) => {
      if (event.conversationId !== conversationId) {
        return;
      }

      setMessages((current) => {
        if (current.some((message) => message.id === event.payload.messageId)) {
          return current;
        }

        return [
          ...current,
          {
            id: event.payload.messageId,
            conversationId: event.conversationId,
            senderId: event.actorId,
            content: event.payload.content,
            createdAt: event.timestamp,
            editedAt: null,
            deletedAt: null,
          },
        ];
      });
    });
  }, [conversationId, realtime]);

  async function handleSend() {
    if (!token || !conversationId || !draft.trim()) {
      return;
    }

    setIsSending(true);

    try {
      const message = await sendMessage(
        token,
        conversationId,
        draft.trim(),
      );

      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current;
        }

        return [...current, message];
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  if (!user || !token) {
    return <Redirect href={'/login' as Href} />;
  }

  const composerPaddingBottom = Math.max(insets.bottom, 12);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
      {isLoading ? (
        <ActivityIndicator style={styles.centered} />
      ) : (
        <FlatList
          style={styles.messageList}
          data={sortedMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const isMine = item.senderId === user.id;
            const senderName = resolveSenderName(item, user.id, memberNames);

            return (
              <View
                style={[
                  styles.message,
                  isMine ? styles.messageMine : styles.messageOther,
                ]}>
                {!isMine ? (
                  <Text style={styles.senderName}>{senderName}</Text>
                ) : null}
                <Text style={styles.messageText}>{item.content}</Text>
                <Text style={styles.messageMeta}>
                  {new Date(item.createdAt).toLocaleTimeString()}
                </Text>
              </View>
            );
          }}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View
        style={[
          styles.composer,
          { paddingBottom: composerPaddingBottom },
        ]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor="#64748b"
          editable={!isSending}
        />
        <Pressable
          style={[styles.sendButton, isSending && styles.sendDisabled]}
          disabled={isSending || draft.trim().length === 0}
          onPress={() => void handleSend()}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  messageList: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  message: {
    maxWidth: '80%',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
  },
  messageOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
  },
  messageText: {
    color: '#f8fafc',
    fontSize: 16,
  },
  senderName: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageMeta: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 6,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.6,
  },
  sendText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  centered: {
    marginTop: 40,
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
