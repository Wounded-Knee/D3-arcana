import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CallTimeline } from '@/components/timeline/call-timeline';
import {
  applyOptimisticSample,
  applyParticipantJoined,
  applyParticipantLeft,
  upsertTrackChunk,
  type TimelineTrack,
} from '@/components/timeline/timeline-model';
import { createCallSession, type CallSession } from '@/lib/call';
import { WaveformSampler } from '@/lib/call/waveform-sampler';
import type { CallParticipantInfo } from '@/lib/call/types';
import { resolveCallMediaUrl } from '@/lib/config';
import { isExpoGo } from '@/lib/expo-go';
import {
  fetchActiveCall,
  fetchCallTimeline,
  fetchConversation,
  fetchMessages,
  joinCall,
  leaveCall,
  postWaveform,
  sendMessage,
  type ActiveCallParticipant,
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
  const [callId, setCallId] = useState<string | null>(null);
  const [callParticipants, setCallParticipants] = useState<
    ActiveCallParticipant[]
  >([]);
  const [inCall, setInCall] = useState(false);
  const [isJoiningCall, setIsJoiningCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [timelineTracks, setTimelineTracks] = useState<TimelineTrack[]>([]);
  const callSessionRef = useRef<CallSession | null>(null);

  const conversationId = id ?? '';

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  const participantCount = callParticipants.length;

  const loadMessages = useCallback(async () => {
    if (!token || !conversationId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [items, conversation, activeCall, timeline] = await Promise.all([
        fetchMessages(token, conversationId),
        fetchConversation(token, conversationId),
        fetchActiveCall(token, conversationId),
        fetchCallTimeline(token, conversationId),
      ]);
      setMessages(items);
      setMemberNames(
        new Map(conversation.members.map((member) => [member.id, member.displayName])),
      );

      if (activeCall) {
        setCallId(activeCall.call.id);
        setCallParticipants(activeCall.participants);
        setCallStartedAt(activeCall.call.startedAt);
      } else {
        setCallId(null);
        setCallParticipants([]);
        setCallStartedAt(null);
        setTimelineTracks([]);
      }

      if (timeline) {
        setCallStartedAt(timeline.call.startedAt);
        setTimelineTracks(timeline.tracks);
      }
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

      switch (event.type) {
        case 'message.created':
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
          break;

        case 'call.started':
          setCallId(event.payload.callId);
          if (token) {
            void fetchCallTimeline(token, conversationId).then((timeline) => {
              if (!timeline) {
                return;
              }

              setCallStartedAt(timeline.call.startedAt);
              setTimelineTracks(timeline.tracks);
            });
          }
          break;

        case 'call.participant.joined':
          setCallId(event.payload.callId);
          setCallParticipants((current) => {
            const existing = current.find(
              (participant) => participant.userId === event.payload.userId,
            );

            if (existing) {
              return current.map((participant) =>
                participant.userId === event.payload.userId
                  ? { ...participant, role: event.payload.role }
                  : participant,
              );
            }

            return [
              ...current,
              {
                userId: event.payload.userId,
                role: event.payload.role,
                displayName:
                  memberNames.get(event.payload.userId) ?? 'Participant',
                joinedAt: event.timestamp,
              },
            ];
          });
          setTimelineTracks((current) =>
            applyParticipantJoined(
              current,
              event.payload.userId,
              memberNames.get(event.payload.userId) ?? 'Participant',
              event.timestamp,
            ),
          );
          break;

        case 'call.participant.left':
          setCallParticipants((current) =>
            current.filter(
              (participant) => participant.userId !== event.payload.userId,
            ),
          );
          setTimelineTracks((current) =>
            applyParticipantLeft(current, event.payload.userId, event.timestamp),
          );
          break;

        case 'call.ended':
          setCallId(null);
          setCallParticipants([]);
          setCallStartedAt(null);
          setTimelineTracks([]);
          setInCall(false);
          void callSessionRef.current?.disconnect();
          callSessionRef.current = null;
          break;

        default:
          break;
      }
    });
  }, [conversationId, memberNames, realtime, token]);

  useEffect(() => {
    if (!realtime || !conversationId) {
      return;
    }

    return realtime.onWaveformChunk((chunk) => {
      if (chunk.conversationId !== conversationId) {
        return;
      }

      setTimelineTracks((current) =>
        upsertTrackChunk(
          current,
          chunk.userId,
          memberNames.get(chunk.userId) ?? 'Participant',
          chunk.startOffsetMs,
          chunk.amplitudes,
        ),
      );
    });
  }, [conversationId, memberNames, realtime]);

  useEffect(() => {
    if (!inCall || !callStartedAt || !token || !conversationId || !user) {
      return;
    }

    const session = callSessionRef.current;
    if (!session) {
      return;
    }

    const sampler = new WaveformSampler({
      startedAtMs: Date.parse(callStartedAt),
      postBatch: (batch) =>
        postWaveform(
          token,
          conversationId,
          batch.startOffsetMs,
          batch.amplitudes,
        ),
      onSample: (offsetMs, amplitude) => {
        setTimelineTracks((current) =>
          applyOptimisticSample(
            current,
            user.id,
            user.displayName,
            offsetMs,
            amplitude,
          ),
        );
      },
    });

    const unsubscribe = session.addListener({
      onLocalAudioLevel: (level) => {
        sampler.push(level);
      },
    });

    return () => {
      unsubscribe();
      sampler.stop();
    };
  }, [callStartedAt, conversationId, inCall, token, user]);

  useEffect(() => {
    return () => {
      void callSessionRef.current?.disconnect();
      callSessionRef.current = null;
    };
  }, []);

  async function handleJoinCall() {
    if (!token || !conversationId || isJoiningCall) {
      return;
    }

    if (Platform.OS !== 'web' && isExpoGo()) {
      setError(
        'Group calls need a development build (pnpm --filter mobile run:android). Chat works in Expo Go; use web for call testing.',
      );
      return;
    }

    setIsJoiningCall(true);
    setError(null);

    try {
      const credentials = await joinCall(token, conversationId);
      setCallId(credentials.callId);

      const timeline = await fetchCallTimeline(token, conversationId);
      if (timeline) {
        setCallStartedAt(timeline.call.startedAt);
        setTimelineTracks(timeline.tracks);
      }

      const session = createCallSession();
      callSessionRef.current = session;

      session.addListener({
        onParticipantsChanged: (participants: CallParticipantInfo[]) => {
          setCallParticipants(
            participants.map((participant: CallParticipantInfo) => ({
              userId: participant.identity,
              role: 'publisher',
              displayName:
                memberNames.get(participant.identity) ??
                participant.name ??
                'Participant',
              joinedAt: new Date().toISOString(),
            })),
          );
        },
        onError: (err: Error) => {
          setError(err.message);
        },
      });

      await session.connect(resolveCallMediaUrl(credentials.url), credentials.token);
      setInCall(true);
      setIsMuted(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join call');
      await callSessionRef.current?.disconnect();
      callSessionRef.current = null;
      setInCall(false);
    } finally {
      setIsJoiningCall(false);
    }
  }

  async function handleLeaveCall() {
    if (!token || !conversationId) {
      return;
    }

    try {
      await leaveCall(token, conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave call');
    } finally {
      await callSessionRef.current?.disconnect();
      callSessionRef.current = null;
      setInCall(false);
      setIsMuted(false);
    }
  }

  async function handleToggleMute() {
    const session = callSessionRef.current;
    if (!session) {
      return;
    }

    const nextMuted = !isMuted;
    await session.setMuted(nextMuted);
    setIsMuted(nextMuted);
  }

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
  const showCallBar = inCall || callId !== null;
  const callControls = (
    <View style={styles.callHeader}>
      <View>
        <Text style={styles.callTitle}>
          {inCall ? 'In call' : 'Call active'}
        </Text>
        <Text style={styles.callMeta}>
          {participantCount} participant{participantCount === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.callActions}>
        {inCall ? (
          <>
            <Pressable style={styles.callButton} onPress={() => void handleToggleMute()}>
              <Text style={styles.callButtonText}>
                {isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.callButton, styles.leaveButton]}
              onPress={() => void handleLeaveCall()}>
              <Text style={styles.callButtonText}>Leave</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.callButton, isJoiningCall && styles.sendDisabled]}
            disabled={isJoiningCall}
            onPress={() => void handleJoinCall()}>
            <Text style={styles.callButtonText}>
              {isJoiningCall ? 'Joining…' : 'Join call'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
      {showCallBar ? (
        callStartedAt ? (
          <CallTimeline
            startedAt={callStartedAt}
            tracks={timelineTracks}
            header={callControls}
          />
        ) : (
          <View style={styles.callBar}>{callControls}</View>
        )
      ) : (
        <View style={styles.startCallRow}>
          <Pressable
            style={[styles.callButton, isJoiningCall && styles.sendDisabled]}
            disabled={isJoiningCall}
            onPress={() => void handleJoinCall()}>
            <Text style={styles.callButtonText}>
              {isJoiningCall ? 'Starting…' : 'Start call'}
            </Text>
          </Pressable>
        </View>
      )}

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
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#14532d',
    borderBottomWidth: 1,
    borderBottomColor: '#166534',
  },
  callHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  startCallRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  callTitle: {
    color: '#dcfce7',
    fontWeight: '700',
    fontSize: 16,
  },
  callMeta: {
    color: '#bbf7d0',
    marginTop: 2,
    fontSize: 13,
  },
  callActions: {
    flexDirection: 'row',
    gap: 8,
  },
  callButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leaveButton: {
    backgroundColor: '#dc2626',
  },
  callButtonText: {
    color: '#ffffff',
    fontWeight: '600',
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
