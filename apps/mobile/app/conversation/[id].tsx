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
import { AnnotationInspect } from '@/components/timeline/annotation-inspect';
import { CallTimeline } from '@/components/timeline/call-timeline';
import {
  applyOptimisticSample,
  applyParticipantJoined,
  applyParticipantLeft,
  scopeFromUserId,
  roundOffsetMs,
  upsertTrackChunk,
  type TimelineAnnotation,
  type TimelineSelection,
  type TimelineTrack,
} from '@/components/timeline/timeline-model';
import { createCallSession, type CallSession } from '@/lib/call';
import { groupSegmentsByRecording } from '@/lib/call/playback-sync';
import type { RecordingSegment } from '@/lib/call/playback-types';
import { WaveformSampler } from '@/lib/call/waveform-sampler';
import type { CallParticipantInfo } from '@/lib/call/types';
import { resolveCallMediaUrl } from '@/lib/config';
import { isExpoGo } from '@/lib/expo-go';
import {
  createCallAnnotation,
  createCallSelection,
  deleteCallAnnotation,
  deleteCallSelection,
  fetchActiveCall,
  fetchAnnotationProfiles,
  fetchCallAnnotations,
  fetchCallRecordings,
  fetchCallTimeline,
  fetchCalls,
  fetchConversation,
  fetchMessages,
  fetchRecordingMedia,
  joinCall,
  leaveCall,
  postWaveform,
  sendMessage,
  updateCallAnnotation,
  updateCallSelection,
  type ActiveCallParticipant,
  type AnnotationProfile,
  type CallAnnotationItem,
  type CallRecordingItem,
  type CallRecordingSession,
  type CallSelectionItem,
  type Message,
} from '@/lib/api';

function toTimelineAnnotation(item: CallAnnotationItem): TimelineAnnotation {
  return {
    id: item.id,
    profile: item.profile,
    note: item.note,
    startMs: item.startOffsetMs,
    endMs: item.endOffsetMs,
    scope: scopeFromUserId(item.userId),
    selectionId: item.selectionId,
    createdBy: item.createdBy,
  };
}

function toTimelineSelection(item: CallSelectionItem): TimelineSelection {
  return {
    id: item.id,
    startMs: item.startOffsetMs,
    endMs: item.endOffsetMs,
    scope: scopeFromUserId(item.userId),
  };
}

function recordingNoticeFromItems(
  items: CallRecordingSession[],
  names: Map<string, string>,
): string | null {
  const interrupted = items.filter((item) => {
    if (item.status !== 'failed') {
      return false;
    }

    return !items.some(
      (other) =>
        other.userId === item.userId &&
        (other.status === 'recording' ||
          other.status === 'ready' ||
          other.status === 'starting') &&
        Date.parse(other.startedAt) > Date.parse(item.startedAt),
    );
  });

  if (interrupted.length === 0) {
    return null;
  }

  const who = interrupted
    .map((item) => names.get(item.userId) ?? 'A participant')
    .join(', ');
  return `Recording interrupted for ${who}`;
}

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
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [callEndedAt, setCallEndedAt] = useState<string | null>(null);
  const [timelineTracks, setTimelineTracks] = useState<TimelineTrack[]>([]);
  const [recordings, setRecordings] = useState<CallRecordingItem[]>([]);
  const [recordingSessions, setRecordingSessions] = useState<
    CallRecordingSession[]
  >([]);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [safeJoinLiveAtMs, setSafeJoinLiveAtMs] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<AnnotationProfile[]>([]);
  const [annotations, setAnnotations] = useState<TimelineAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const callSessionRef = useRef<CallSession | null>(null);
  const callIdRef = useRef<string | null>(null);

  const conversationId = id ?? '';
  callIdRef.current = callId;

  useEffect(() => {
    if (!token) {
      return;
    }
    void fetchAnnotationProfiles(token)
      .then(setProfiles)
      .catch(() => {
        setProfiles([]);
      });
  }, [token]);

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
      const [items, conversation, activeCall, calls] = await Promise.all([
        fetchMessages(token, conversationId),
        fetchConversation(token, conversationId),
        fetchActiveCall(token, conversationId),
        fetchCalls(token, conversationId).catch(() => []),
      ]);
      setMessages(items);
      const names = new Map(
        conversation.members.map((member) => [member.id, member.displayName]),
      );
      setMemberNames(names);

      const latest = activeCall?.call ?? calls[0] ?? null;

      if (latest) {
        setCallId(latest.id);
        setCallStartedAt(latest.startedAt);
        setCallEndedAt(
          'endedAt' in latest ? (latest.endedAt as string | null) : null,
        );
        setCallParticipants(activeCall?.participants ?? []);
        const [timeline, callRecordings, callAnnotations] = await Promise.all([
          fetchCallTimeline(token, conversationId, latest.id),
          fetchCallRecordings(token, conversationId, latest.id).catch(() => ({
            recordings: [],
            sessions: [],
          })),
          fetchCallAnnotations(token, conversationId, latest.id).catch(() => []),
        ]);
        if (timeline) {
          setCallStartedAt(timeline.call.startedAt);
          setCallEndedAt(timeline.call.endedAt);
          setTimelineTracks(timeline.tracks);
        }
        setRecordings(callRecordings.recordings);
        setRecordingSessions(callRecordings.sessions);
        setRecordingNotice(
          recordingNoticeFromItems(callRecordings.sessions, names),
        );
        setAnnotations(callAnnotations.map(toTimelineAnnotation));
      } else {
        setCallId(null);
        setCallParticipants([]);
        setCallStartedAt(null);
        setCallEndedAt(null);
        setTimelineTracks([]);
        setRecordings([]);
        setRecordingSessions([]);
        setRecordingNotice(null);
        setAnnotations([]);
        setSelectedAnnotationId(null);
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
    if (!recordingNotice?.startsWith('Recording restored')) {
      return;
    }

    const timer = setTimeout(() => {
      setRecordingNotice(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [recordingNotice]);

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
          setCallEndedAt(null);
          setRecordings([]);
          setRecordingSessions([]);
          if (token) {
            void fetchCallTimeline(token, conversationId).then((timeline) => {
              if (!timeline) {
                return;
              }

              setCallStartedAt(timeline.call.startedAt);
              setTimelineTracks(timeline.tracks);
            }).catch(() => undefined);
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
          setCallParticipants([]);
          setInCall(false);
          setIsSpeakerOn(false);
          void callSessionRef.current?.disconnect();
          callSessionRef.current = null;
          if (token && conversationId && event.payload.callId) {
            setCallId(event.payload.callId);
            void fetchCallTimeline(
              token,
              conversationId,
              event.payload.callId,
            ).then((timeline) => {
              if (!timeline) {
                return;
              }
              setCallStartedAt(timeline.call.startedAt);
              setCallEndedAt(timeline.call.endedAt);
              setTimelineTracks(timeline.tracks);
            }).catch(() => undefined);
            void fetchCallRecordings(
              token,
              conversationId,
              event.payload.callId,
            ).then((body) => {
              setRecordings(body.recordings);
              setRecordingSessions(body.sessions);
              setRecordingNotice(
                recordingNoticeFromItems(body.sessions, memberNames),
              );
            }).catch(() => undefined);
          }
          break;

        case 'call.recording.failed':
          setRecordingNotice(
            `Recording interrupted for ${memberNames.get(event.payload.userId) ?? 'a participant'}`,
          );
          break;

        case 'call.recording.restored':
          setRecordingNotice(
            `Recording restored for ${memberNames.get(event.payload.userId) ?? 'a participant'}`,
          );
          break;

        case 'annotation.created':
        case 'annotation.updated':
          if (event.payload.callId !== callIdRef.current) {
            break;
          }
          setAnnotations((current) => {
            const next = toTimelineAnnotation({
              id: event.payload.annotationId,
              callId: event.payload.callId,
              conversationId: event.conversationId,
              createdBy: event.payload.createdBy,
              profile: {
                ...event.payload.profile,
                sortOrder: 0,
              },
              note: event.payload.note,
              startOffsetMs: event.payload.startOffsetMs,
              endOffsetMs: event.payload.endOffsetMs,
              userId: event.payload.userId,
              selectionId: event.payload.selectionId,
              createdAt: event.timestamp,
              updatedAt: event.timestamp,
            });
            const index = current.findIndex((item) => item.id === next.id);
            if (index === -1) {
              return [...current, next];
            }
            return current.map((item) => (item.id === next.id ? next : item));
          });
          if (
            event.type === 'annotation.created' &&
            event.actorId === user?.id
          ) {
            setSelectedAnnotationId(event.payload.annotationId);
          }
          break;

        case 'annotation.deleted':
          if (event.payload.callId !== callIdRef.current) {
            break;
          }
          setAnnotations((current) =>
            current.filter((item) => item.id !== event.payload.annotationId),
          );
          setSelectedAnnotationId((current) =>
            current === event.payload.annotationId ? null : current,
          );
          break;

        case 'call.recording.completed':
          if (token && conversationId && event.payload.callId) {
            void fetchCallRecordings(
              token,
              conversationId,
              event.payload.callId,
            ).then((body) => {
              setRecordings(body.recordings);
              setRecordingSessions(body.sessions);
              setRecordingNotice(
                recordingNoticeFromItems(body.sessions, memberNames),
              );
            }).catch(() => undefined);
          }
          break;

        default:
          break;
      }
    });
  }, [conversationId, memberNames, realtime, token, user?.id]);

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
    if (!realtime || !conversationId) {
      return;
    }

    const stopFragment = realtime.onRecordingFragment((fragment) => {
      if (fragment.conversationId !== conversationId) {
        return;
      }

      setRecordings((current) => {
        if (current.some((item) => item.id === fragment.fragmentId)) {
          return current;
        }

        return [
          ...current,
          {
            id: fragment.fragmentId,
            recordingId: fragment.recordingId,
            callId: fragment.callId,
            userId: fragment.userId,
            status: 'ready',
            callOffsetMs: fragment.callOffsetMs,
            durationMs: fragment.durationMs,
            objectKey: '',
            contentType: 'audio/wav',
            format: 'wav',
            error: null,
            startedAt: new Date().toISOString(),
            endedAt: null,
            playbackUrl: fragment.playbackUrl,
          },
        ];
      });
    });

    const stopCatchup = realtime.onCatchupSafeToJoinLive((message) => {
      if (message.conversationId !== conversationId) {
        return;
      }

      if (callId && message.callId !== callId) {
        return;
      }

      setSafeJoinLiveAtMs(message.atCallOffsetMs);
    });

    return () => {
      stopFragment();
      stopCatchup();
    };
  }, [callId, conversationId, realtime]);

  useEffect(() => {
    if (!token || !conversationId || !callId || callEndedAt) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const tick = () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      void fetchCallRecordings(token, conversationId, callId)
        .then((body) => {
          if (cancelled) {
            return;
          }
          setRecordings(body.recordings);
          setRecordingSessions(body.sessions);
          setRecordingNotice(
            recordingNoticeFromItems(body.sessions, memberNames),
          );
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };

    tick();
    const timer = setInterval(tick, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [callEndedAt, callId, conversationId, memberNames, token]);

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
      setCallEndedAt(null);

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
      setIsSpeakerOn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join call');
      await callSessionRef.current?.disconnect();
      callSessionRef.current = null;
      setInCall(false);
      setIsSpeakerOn(false);
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
      setIsSpeakerOn(false);
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

  async function handleToggleSpeaker() {
    const session = callSessionRef.current;
    if (!session) {
      return;
    }

    const next = !isSpeakerOn;
    await session.setSpeakerphone(next);
    setIsSpeakerOn(next);
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
  const callIsLive = callId !== null && callEndedAt === null;
  const selectedAnnotation = annotations.find(
    (item) => item.id === selectedAnnotationId,
  );

  async function handleCreateAnnotation(input: {
      profileId: string;
      selection: TimelineSelection | null;
      startMs: number;
      endMs: number;
      userId: string | null;
    }) {
      if (!token || !conversationId || !callId || !input.profileId) {
        return;
      }

      try {
      const startOffsetMs = roundOffsetMs(input.startMs);
      const endOffsetMs = roundOffsetMs(input.endMs);
      let selectionId = input.selection?.id ?? null;
      if (input.selection && !selectionId) {
        const createdSelection = await createCallSelection(
          token,
          conversationId,
          callId,
          {
            startOffsetMs: roundOffsetMs(input.selection.startMs),
            endOffsetMs: roundOffsetMs(input.selection.endMs),
            userId:
              input.selection.scope.kind === 'channel'
                ? input.selection.scope.userId
                : null,
          },
        );
        selectionId = createdSelection.id;
      }

      const created = await createCallAnnotation(
        token,
        conversationId,
        callId,
        {
          profileId: input.profileId,
          selectionId,
          startOffsetMs,
          endOffsetMs,
          userId: input.userId,
        },
      );
      const mapped = toTimelineAnnotation(created);
      setAnnotations((current) =>
        current.some((item) => item.id === mapped.id)
          ? current.map((item) => (item.id === mapped.id ? mapped : item))
          : [...current, mapped],
      );
      setSelectedAnnotationId(mapped.id);
      setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create annotation');
      }
  }

  async function handleSelectionCommit(selection: TimelineSelection) {
      if (!token || !conversationId || !callId) {
        return selection;
      }

      try {
      const userId =
        selection.scope.kind === 'channel' ? selection.scope.userId : null;
      const startOffsetMs = roundOffsetMs(selection.startMs);
      const endOffsetMs = roundOffsetMs(selection.endMs);
      if (selection.id) {
        const updated = await updateCallSelection(
          token,
          conversationId,
          callId,
          selection.id,
          {
            startOffsetMs,
            endOffsetMs,
            userId,
          },
        );
        return toTimelineSelection(updated);
      }

      const created = await createCallSelection(token, conversationId, callId, {
        startOffsetMs,
        endOffsetMs,
        userId,
      });
      return toTimelineSelection(created);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save selection');
        return selection;
      }
  }

  async function handleSelectionClear(selection: TimelineSelection | null) {
      if (!token || !conversationId || !callId || !selection?.id) {
        return;
      }
      const linked = annotations.some(
        (item) => item.selectionId === selection.id,
      );
      if (linked) {
        return;
      }
      try {
        await deleteCallSelection(token, conversationId, callId, selection.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to clear selection',
        );
      }
  }

  async function handleAttachSelection(selection: TimelineSelection) {
      if (!token || !conversationId || !callId || !selectedAnnotationId) {
        return;
      }
      try {
        let selectionId = selection.id;
        if (!selectionId) {
          const created = await createCallSelection(
            token,
            conversationId,
            callId,
            {
              startOffsetMs: roundOffsetMs(selection.startMs),
              endOffsetMs: roundOffsetMs(selection.endMs),
              userId:
                selection.scope.kind === 'channel'
                  ? selection.scope.userId
                  : null,
            },
          );
          selectionId = created.id;
        }
        const updated = await updateCallAnnotation(
          token,
          conversationId,
          callId,
          selectedAnnotationId,
          { selectionId },
        );
        const mapped = toTimelineAnnotation(updated);
        setAnnotations((current) =>
          current.map((item) => (item.id === mapped.id ? mapped : item)),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to link selection',
        );
      }
  }

  async function handlePreparePlayback(
    segments: RecordingSegment[],
  ): Promise<RecordingSegment[]> {
    if (!token || !conversationId || !callId) {
      return segments;
    }

    const groups = groupSegmentsByRecording(segments);
    const prepared: RecordingSegment[] = [];
    for (const [recordingId, fragments] of groups) {
      if (fragments.length <= 1 || !fragments[0]?.recordingId) {
        prepared.push(...fragments);
        continue;
      }

      try {
        const media = await fetchRecordingMedia(
          token,
          conversationId,
          callId,
          recordingId,
        );
        prepared.push({
          id: media.recordingId,
          recordingId: media.recordingId,
          userId: media.userId,
          callOffsetMs: media.callOffsetMs,
          durationMs: media.durationMs,
          playbackUrl: media.playbackUrl,
          status: 'ready',
        });
      } catch {
        prepared.push(...fragments);
      }
    }

    return prepared;
  }

  const showCallBar = inCall || callId !== null;
  const callControls = (
    <View style={styles.callHeader}>
      <View>
        <Text style={styles.callTitle}>
          {inCall ? 'In call' : callIsLive ? 'Call active' : 'Call recording'}
        </Text>
        <Text style={styles.callMeta}>
          {callIsLive
            ? `${participantCount} participant${participantCount === 1 ? '' : 's'}`
            : 'Scrub the timeline to play'}
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
            {Platform.OS === 'android' ? (
              <Pressable
                style={[styles.callButton, isSpeakerOn && styles.speakerActive]}
                onPress={() => void handleToggleSpeaker()}>
                <Text style={styles.callButtonText}>
                  {isSpeakerOn ? 'Earpiece' : 'Speaker'}
                </Text>
              </Pressable>
            ) : null}
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
              {isJoiningCall
                ? callIsLive
                  ? 'Joining…'
                  : 'Starting…'
                : callIsLive
                  ? 'Join call'
                  : 'Start call'}
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
            key={callId ?? 'none'}
            startedAt={callStartedAt}
            endedAt={callEndedAt}
            tracks={timelineTracks}
            recordings={recordings.map((recording) => ({
              id: recording.id,
              recordingId: recording.recordingId,
              userId: recording.userId,
              callOffsetMs: recording.callOffsetMs,
              durationMs: recording.durationMs ?? 0,
              playbackUrl: recording.playbackUrl,
              status: recording.status,
            }))}
            live={callIsLive}
            header={callControls}
            onReplayActiveChange={(active) => {
              callSessionRef.current?.setRemoteAudioMuted(active);
            }}
            safeJoinLiveAtMs={safeJoinLiveAtMs}
            onSafeJoinConsumed={() => setSafeJoinLiveAtMs(null)}
            profiles={profiles}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={setSelectedAnnotationId}
            onCreateAnnotation={(input) => {
              void handleCreateAnnotation(input);
            }}
            onSelectionCommit={handleSelectionCommit}
            onSelectionClear={(selection) => {
              void handleSelectionClear(selection);
            }}
            onAttachSelection={(selection) => {
              void handleAttachSelection(selection);
            }}
            onPreparePlayback={handlePreparePlayback}
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

      {selectedAnnotation ? (
        <AnnotationInspect
          annotation={selectedAnnotation}
          channelLabel={
            selectedAnnotation.scope.kind === 'channel'
              ? memberNames.get(selectedAnnotation.scope.userId) ??
                'One channel'
              : 'All channels'
          }
          canEdit={selectedAnnotation.createdBy.id === user.id}
          onChangeNote={(note) => {
            if (!token || !conversationId || !callId) {
              return;
            }
            void updateCallAnnotation(
              token,
              conversationId,
              callId,
              selectedAnnotation.id,
              { note },
            ).then((updated) => {
              const mapped = toTimelineAnnotation(updated);
              setAnnotations((current) =>
                current.map((item) =>
                  item.id === mapped.id ? mapped : item,
                ),
              );
            }).catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : 'Failed to update note',
              );
            });
          }}
          onDismiss={() => setSelectedAnnotationId(null)}
          onDelete={() => {
            if (!token || !conversationId || !callId) {
              return;
            }
            void deleteCallAnnotation(
              token,
              conversationId,
              callId,
              selectedAnnotation.id,
            ).then(() => {
              setAnnotations((current) =>
                current.filter((item) => item.id !== selectedAnnotation.id),
              );
              setSelectedAnnotationId(null);
            }).catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : 'Failed to delete annotation',
              );
            });
          }}
        />
      ) : null}

      {recordingNotice ? (
        <Text style={styles.recordingNotice}>{recordingNotice}</Text>
      ) : null}

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
  speakerActive: {
    backgroundColor: '#0f766e',
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
  recordingNotice: {
    color: '#facc15',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#422006',
  },
});
