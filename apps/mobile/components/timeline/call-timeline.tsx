import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Rect, Svg } from 'react-native-svg';

import { CATCHUP_RATE, isAtReadyEdge } from '@/lib/call/catchup';
import { createPlaybackClock } from '@/lib/call/playback-clock';
import { withLiveTail } from '@/lib/call/playback-sync';
import type { RecordingSegment } from '@/lib/call/playback-types';
import { AnnotationMarkers } from './annotation-markers';
import { ParticipantTrack, TRACK_HEIGHT } from './participant-track';
import { ProfilePickerButton } from './profile-picker';
import {
  clampMsPerPixel,
  clampViewStart,
  DEFAULT_VIEWPORT_MS,
  LABEL_WIDTH,
  OVERSCAN_PX,
} from './timeline-math';
import { panLog } from './timeline-debug';
import type {
  ChannelScope,
  TimelineAnnotation,
  TimelineAnnotationProfile,
  TimelineSelection,
  TimelineTrack,
} from './timeline-model';
import { snapSelectionEdges, SELECTION_MIN_WIDTH_MS } from './timeline-snap';
import { TimelineRuler } from './timeline-ruler';

const RULER_HEIGHT = 22;

const MAX_TRACKS_VISIBLE = 4;
const LIVE_EDGE_MS = 400;
const VIEW_COMMIT_MS = 32;
const HANDLE_HIT_PX = 24;

type CatchupMode = 'off' | 'catching' | 'riding';

type CallTimelineProps = {
  startedAt: string;
  endedAt?: string | null;
  tracks: TimelineTrack[];
  header: ReactNode;
  recordings?: RecordingSegment[];
  live?: boolean;
  onReplayActiveChange?: (active: boolean) => void;
  safeJoinLiveAtMs?: number | null;
  onSafeJoinConsumed?: () => void;
  profiles?: TimelineAnnotationProfile[];
  annotations?: TimelineAnnotation[];
  selectedAnnotationId?: string | null;
  onSelectAnnotation?: (id: string | null) => void;
  onCreateAnnotation?: (input: {
    profileId: string;
    selection: TimelineSelection | null;
    startMs: number;
    endMs: number;
    userId: string | null;
  }) => void;
  onSelectionCommit?: (
    selection: TimelineSelection,
  ) => void | Promise<TimelineSelection | void>;
  onSelectionClear?: (selection: TimelineSelection | null) => void;
  onAttachSelection?: (selection: TimelineSelection) => void;
  onPreparePlayback?: (
    segments: RecordingSegment[],
  ) => Promise<RecordingSegment[]>;
};

export function CallTimeline({
  startedAt,
  endedAt,
  tracks,
  header,
  recordings = [],
  live = true,
  onReplayActiveChange,
  safeJoinLiveAtMs = null,
  onSafeJoinConsumed,
  profiles = [],
  annotations = [],
  selectedAnnotationId = null,
  onSelectAnnotation,
  onCreateAnnotation,
  onSelectionCommit,
  onSelectionClear,
  onAttachSelection,
  onPreparePlayback,
}: CallTimelineProps) {
  const startedAtMs = Date.parse(startedAt);
  const endedAtMs = endedAt ? Date.parse(endedAt) : null;
  const frozenDurationMs =
    endedAtMs !== null && Number.isFinite(endedAtMs)
      ? Math.max(0, endedAtMs - startedAtMs)
      : null;

  const [width, setWidth] = useState(0);
  const [nowMs, setNowMs] = useState(() =>
    frozenDurationMs ?? Math.max(0, Date.now() - startedAtMs),
  );
  const [playheadMs, setPlayheadMs] = useState(0);
  const [viewStartMs, setViewStartMs] = useState(0);
  const [msPerPixel, setMsPerPixel] = useState(30);
  const [followLive, setFollowLive] = useState(live);
  const [playing, setPlaying] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
  const [soloUserId, setSoloUserId] = useState<string | null>(null);
  const [catchup, setCatchup] = useState<CatchupMode>('off');
  const [ridingSinceMs, setRidingSinceMs] = useState<number | null>(null);

  const clockRef = useRef(createPlaybackClock());
  const playingSegmentsRef = useRef<RecordingSegment[]>([]);
  const playheadMsRef = useRef(playheadMs);
  const followLiveRef = useRef(followLive);
  const playingRef = useRef(playing);
  const catchupRef = useRef(catchup);
  const gesturingRef = useRef(false);
  const pendingViewStartRef = useRef(0);
  const viewCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayActiveRef = useRef(onReplayActiveChange);
  replayActiveRef.current = onReplayActiveChange;
  playheadMsRef.current = playheadMs;
  followLiveRef.current = followLive;
  playingRef.current = playing;
  catchupRef.current = catchup;

  const viewStartSv = useSharedValue(0);
  const msPerPixelSv = useSharedValue(30);
  const playheadSv = useSharedValue(0);
  const durationSv = useSharedValue(DEFAULT_VIEWPORT_MS);
  const waveformWidthSv = useSharedValue(0);
  const nowSv = useSharedValue(0);
  const liveSv = useSharedValue(live ? 1 : 0);
  const followLiveSv = useSharedValue(live ? 1 : 0);
  const selectingSv = useSharedValue(0);
  const committedViewStartSv = useSharedValue(0);
  const contentShiftPx = useSharedValue(0);
  const panOriginSv = useSharedValue({
    viewStartMs: 0,
    msPerPixel: 30,
    selection: 0,
    mode: 0,
    trackIndex: -1,
    startMs: 0,
    endMs: 0,
  });
  const lastSelectionSv = useSharedValue({
    startMs: -1,
    endMs: -1,
    trackIndex: -1,
  });
  const selectionRef = useRef<TimelineSelection | null>(null);
  selectionRef.current = selection;
  const panSampleSv = useSharedValue(0);
  const tracksDuringPanRef = useRef(tracks);
  const pinchOriginSv = useSharedValue({
    viewStartMs: 0,
    msPerPixel: 30,
    focalX: 0,
  });

  const waveformWidth = Math.max(0, width - LABEL_WIDTH);
  const durationMs = Math.max(
    frozenDurationMs ?? nowMs,
    DEFAULT_VIEWPORT_MS,
  );
  const readySegments = useMemo(
    () =>
      recordings.filter(
        (segment) => segment.status === 'ready' && segment.playbackUrl,
      ),
    [recordings],
  );
  const readySegmentsRef = useRef(readySegments);
  readySegmentsRef.current = readySegments;
  const onSafeJoinConsumedRef = useRef(onSafeJoinConsumed);
  onSafeJoinConsumedRef.current = onSafeJoinConsumed;
  const safeJoinLiveAtMsRef = useRef(safeJoinLiveAtMs);
  safeJoinLiveAtMsRef.current = safeJoinLiveAtMs;
  const canPlay = readySegments.length > 0;
  const overscanPx = Math.max(waveformWidth, OVERSCAN_PX);

  useEffect(() => {
    waveformWidthSv.value = waveformWidth;
  }, [waveformWidth, waveformWidthSv]);

  useEffect(() => {
    durationSv.value = durationMs;
  }, [durationMs, durationSv]);

  useEffect(() => {
    nowSv.value = nowMs;
  }, [nowMs, nowSv]);

  useEffect(() => {
    liveSv.value = live ? 1 : 0;
  }, [live, liveSv]);

  useEffect(() => {
    followLiveSv.value = followLive ? 1 : 0;
  }, [followLive, followLiveSv]);

  useEffect(() => {
    if (live && frozenDurationMs === null) {
      setFollowLive(true);
    }
  }, [frozenDurationMs, live]);

  useEffect(() => {
    selectingSv.value = selecting ? 1 : 0;
  }, [selecting, selectingSv]);

  useEffect(() => {
    if (!selection) {
      lastSelectionSv.value = { startMs: -1, endMs: -1, trackIndex: -1 };
      return;
    }
    lastSelectionSv.value = {
      startMs: selection.startMs,
      endMs: selection.endMs,
      trackIndex:
        selection.scope.kind === 'channel'
          ? tracks.findIndex((track) => track.userId === selection.scope.userId)
          : -1,
    };
  }, [lastSelectionSv, selection, tracks]);

  useEffect(() => {
    msPerPixelSv.value = msPerPixel;
  }, [msPerPixel, msPerPixelSv]);

  useLayoutEffect(() => {
    committedViewStartSv.value = viewStartMs;
    const perPx = msPerPixelSv.value || 1;
    const liveViewStart = viewStartSv.value;
    const nextShiftPx = (viewStartMs - liveViewStart) / perPx;
    if (gesturingRef.current) {
      panLog('react.syncViewStart', {
        gesturing: true,
        viewStartMs: Math.round(viewStartMs),
        liveViewStart: Math.round(liveViewStart),
        nextShiftPx: Math.round(nextShiftPx * 10) / 10,
      });
      contentShiftPx.value = nextShiftPx;
      return;
    }

    if (followLiveRef.current && liveSv.value === 1) {
      contentShiftPx.value = 0;
      return;
    }

    viewStartSv.value = viewStartMs;
    contentShiftPx.value = 0;
  }, [
    committedViewStartSv,
    contentShiftPx,
    msPerPixelSv,
    viewStartMs,
    viewStartSv,
  ]);

  useEffect(() => {
    if (waveformWidth <= 0) {
      return;
    }

    setMsPerPixel((current) =>
      clampMsPerPixel(current, waveformWidth, durationMs),
    );
  }, [durationMs, waveformWidth]);

  useEffect(() => {
    if (!live || frozenDurationMs !== null) {
      return;
    }

    const timer = setInterval(() => {
      const nextNow = Math.max(0, Date.now() - startedAtMs);
      const dragging = gesturingRef.current;
      if (dragging) {
        panLog('timer.live100ms', {
          gesturing: true,
          followLive: followLiveRef.current,
          setNowMs: true,
          skippedViewFollow:
            !followLiveRef.current ||
            waveformWidth <= 0 ||
            playingRef.current,
          nowMs: Math.round(nextNow),
        });
      }
      setNowMs(nextNow);
      nowSv.value = nextNow;

      if (playingRef.current || catchupRef.current !== 'off') {
        clockRef.current.update({
          segments: withLiveTail(
            playingSegmentsRef.current,
            readySegmentsRef.current,
          ),
          untilMs: nextNow,
        });
      }

      if (catchupRef.current !== 'off') {
        if (
          catchupRef.current === 'catching' &&
          isAtReadyEdge(playheadMsRef.current, nextNow)
        ) {
          clockRef.current.setPlaybackRate(1);
          setCatchup('riding');
          setRidingSinceMs(nextNow);
        }
        if (safeJoinLiveAtMsRef.current !== null) {
          clockRef.current.pause();
          setPlaying(false);
          setCatchup('off');
          setRidingSinceMs(null);
          playheadSv.value = nextNow;
          setPlayheadMs(nextNow);
          setFollowLive(true);
          replayActiveRef.current?.(false);
          onSafeJoinConsumedRef.current?.();
        }
        return;
      }

      const paneWidth = waveformWidthSv.value;
      if (
        gesturingRef.current ||
        !followLiveRef.current ||
        paneWidth <= 0 ||
        playingRef.current
      ) {
        return;
      }

      const viewportMs = paneWidth * msPerPixelSv.value;
      const nextStart = clampViewStart(
        nextNow - viewportMs,
        viewportMs,
        nextNow,
      );
      viewStartSv.value = nextStart;
      setViewStartMs(nextStart);
      if (!playingRef.current) {
        playheadSv.value = nextNow;
        setPlayheadMs(nextNow);
      }
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, [frozenDurationMs, live, nowSv, playheadSv, startedAtMs, viewStartSv]);

  useEffect(() => {
    const clock = clockRef.current;
    return () => {
      clock.dispose?.();
      clock.pause();
    };
  }, []);

  useEffect(() => {
    if (!gesturingRef.current) {
      tracksDuringPanRef.current = tracks;
      return;
    }

    if (tracksDuringPanRef.current !== tracks) {
      panLog('react.tracksChangedDuringPan', {
        trackCount: tracks.length,
      });
      tracksDuringPanRef.current = tracks;
    }
  }, [tracks]);

  const commitViewStart = useCallback((nextStart: number, immediate: boolean, reason: string) => {
    pendingViewStartRef.current = nextStart;
    if (immediate) {
      if (viewCommitTimer.current) {
        clearTimeout(viewCommitTimer.current);
        viewCommitTimer.current = null;
      }
      panLog('commit.immediate', {
        reason,
        nextStart: Math.round(nextStart),
      });
      setViewStartMs(nextStart);
      return;
    }

    if (viewCommitTimer.current) {
      panLog('commit.throttleSkip', {
        reason,
        nextStart: Math.round(nextStart),
        pending: Math.round(pendingViewStartRef.current),
      });
      return;
    }

    panLog('commit.throttleSchedule', {
      reason,
      nextStart: Math.round(nextStart),
      delayMs: VIEW_COMMIT_MS,
    });
    viewCommitTimer.current = setTimeout(() => {
      viewCommitTimer.current = null;
      panLog('commit.throttleFire', {
        reason,
        nextStart: Math.round(pendingViewStartRef.current),
      });
      setViewStartMs(pendingViewStartRef.current);
    }, VIEW_COMMIT_MS);
  }, []);

  const setGesturing = useCallback((value: boolean) => {
    gesturingRef.current = value;
    panLog(value ? 'gesture.begin' : 'gesture.flagOff', {
      followLive: followLiveRef.current,
    });
  }, []);

  const handleFollowLiveChange = useCallback((nextFollow: boolean) => {
    if (followLiveRef.current === nextFollow) {
      return;
    }
    panLog('react.followLive', { nextFollow });
    setFollowLive(nextFollow);
    if (nextFollow) {
      const liveMs = nowSv.value;
      playheadSv.value = liveMs;
      setPlayheadMs(liveMs);
      replayActiveRef.current?.(false);
    }
  }, [nowSv, playheadSv]);

  const handlePanEnd = useCallback(
    (nextStart: number, nextFollow: boolean) => {
      panLog('gesture.end', {
        nextStart: Math.round(nextStart),
        nextFollow,
      });
      gesturingRef.current = false;
      commitViewStart(nextStart, true, 'pan-end');
      handleFollowLiveChange(nextFollow);
    },
    [commitViewStart, handleFollowLiveChange],
  );

  const handleSelectionGestureEnd = useCallback(
    (
      startMs: number,
      endMs: number,
      trackIndex: number,
      mode: number,
    ) => {
      gesturingRef.current = false;
      const scope: ChannelScope =
        trackIndex >= 0 && tracks[trackIndex]
          ? { kind: 'channel', userId: tracks[trackIndex]!.userId }
          : { kind: 'all' };
      const moved =
        mode === 2 ? 'start' : mode === 3 ? 'end' : 'both';
      const snapped = snapSelectionEdges(
        tracksDuringPanRef.current,
        scope,
        startMs,
        endMs,
        moved,
        durationSv.value,
      );
      const next: TimelineSelection = {
        id: selectionRef.current?.id,
        startMs: snapped.startMs,
        endMs: snapped.endMs,
        scope,
      };
      setSelection(next);
      void Promise.resolve(onSelectionCommit?.(next))
        .then((committed) => {
          const withId = committed?.id ? { ...next, id: committed.id } : next;
          if (committed?.id) {
            setSelection((current) =>
              current ? { ...current, id: committed.id } : withId,
            );
          }
          if (mode === 1 && selectedAnnotationId) {
            return onAttachSelection?.(withId);
          }
        })
        .catch(() => undefined);
    },
    [durationSv, onAttachSelection, onSelectionCommit, selectedAnnotationId, tracks],
  );

  const handleSelectionDrag = useCallback(
    (startMs: number, endMs: number, trackIndex: number) => {
      const scope: ChannelScope =
        trackIndex >= 0 && tracks[trackIndex]
          ? { kind: 'channel', userId: tracks[trackIndex]!.userId }
          : { kind: 'all' };
      setSelection((current) => {
        if (
          current?.startMs === startMs &&
          current.endMs === endMs &&
          current.scope.kind === scope.kind &&
          (scope.kind === 'all' ||
            (current.scope.kind === 'channel' &&
              current.scope.userId === scope.userId))
        ) {
          return current;
        }
        return {
          id: current?.id,
          startMs,
          endMs,
          scope,
        };
      });
      if (followLiveRef.current) {
        setFollowLive(false);
        replayActiveRef.current?.(true);
      }
    },
    [tracks],
  );

  const handlePinchCommit = useCallback(
    (nextMsPerPixel: number, nextStart: number) => {
      setMsPerPixel(nextMsPerPixel);
      commitViewStart(nextStart, false, 'pinch');
      setFollowLive(false);
    },
    [commitViewStart],
  );

  const handlePinchEnd = useCallback(
    (nextMsPerPixel: number, nextStart: number) => {
      gesturingRef.current = false;
      setMsPerPixel(nextMsPerPixel);
      commitViewStart(nextStart, true, 'pinch-end');
    },
    [commitViewStart],
  );

  const handleTapSeek = useCallback((x: number, y: number) => {
    if (waveformWidthSv.value <= 0 || x < LABEL_WIDTH) {
      return;
    }

    const atMs =
      viewStartSv.value + (x - LABEL_WIDTH) * msPerPixelSv.value;
    const hit = annotations.find((annotation) => {
      const isPoint = annotation.endMs <= annotation.startMs;
      const pad = isPoint ? 400 : 0;
      const start = annotation.startMs - pad / 2;
      const end = annotation.endMs + pad / 2;
      if (atMs < start || atMs > end) {
        return false;
      }
      if (annotation.scope.kind === 'all') {
        return y <= RULER_HEIGHT + TRACK_HEIGHT * tracks.length;
      }
      const index = tracks.findIndex(
        (track) => track.userId === annotation.scope.userId,
      );
      if (index < 0) {
        return false;
      }
      const top = RULER_HEIGHT + index * TRACK_HEIGHT;
      return y >= top && y <= top + TRACK_HEIGHT;
    });
    const nextPlayhead = Math.max(
      0,
      Math.min(durationSv.value, atMs),
    );
    playheadSv.value = nextPlayhead;
    setPlayheadMs(nextPlayhead);
    setFollowLive(false);
    replayActiveRef.current?.(true);
    if (playingRef.current) {
      clockRef.current.pause();
      setPlaying(false);
    }

    if (hit) {
      onSelectAnnotation?.(hit.id);
      return;
    }

    onSelectAnnotation?.(null);
    const currentSelection = selectionRef.current;
    if (currentSelection) {
      setSelection(null);
      onSelectionClear?.(currentSelection);
    }
  }, [
    annotations,
    durationSv,
    msPerPixelSv,
    onSelectAnnotation,
    onSelectionClear,
    playheadSv,
    tracks,
    viewStartSv,
    waveformWidthSv,
  ]);

  const handlePanSample = useCallback(
    (
      translationX: number,
      nextStart: number,
      committed: number,
      shiftPx: number,
      frame: number,
    ) => {
      panLog('worklet.panSample', {
        frame,
        translationX: Math.round(translationX),
        nextStart: Math.round(nextStart),
        committed: Math.round(committed),
        shiftPx: Math.round(shiftPx * 10) / 10,
      });
    },
    [],
  );

  const handleSolo = useCallback((userId: string) => {
    setSoloUserId((current) => (current === userId ? null : userId));
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .onBegin((event) => {
          runOnJS(setGesturing)(true);
          panSampleSv.value = 0;
          const last = lastSelectionSv.value;
          const perPx = msPerPixelSv.value || 1;
          const leftX =
            LABEL_WIDTH + (last.startMs - viewStartSv.value) / perPx;
          const rightX =
            LABEL_WIDTH + (last.endMs - viewStartSv.value) / perPx;
          const handleTop =
            last.trackIndex >= 0
              ? RULER_HEIGHT + last.trackIndex * TRACK_HEIGHT
              : 0;
          const handleBottom =
            last.trackIndex >= 0
              ? handleTop + TRACK_HEIGHT
              : RULER_HEIGHT + MAX_TRACKS_VISIBLE * TRACK_HEIGHT;
          const onHandleY =
            last.startMs >= 0 &&
            event.y >= handleTop &&
            event.y <= handleBottom;
          let mode = 0;
          if (onHandleY && last.startMs >= 0) {
            if (Math.abs(event.x - leftX) <= HANDLE_HIT_PX) {
              mode = 2;
            } else if (Math.abs(event.x - rightX) <= HANDLE_HIT_PX) {
              mode = 3;
            }
          }
          let trackIndex = last.trackIndex;
          if (mode === 0 && selectingSv.value) {
            mode = 1;
            if (event.y < RULER_HEIGHT) {
              trackIndex = -1;
            } else {
              trackIndex = Math.floor((event.y - RULER_HEIGHT) / TRACK_HEIGHT);
            }
          }
          panOriginSv.value = {
            viewStartMs: viewStartSv.value,
            msPerPixel: msPerPixelSv.value,
            selection: selectingSv.value,
            mode,
            trackIndex,
            startMs: last.startMs,
            endMs: last.endMs,
          };
        })
        .onUpdate((event) => {
          const origin = panOriginSv.value;
          const paneWidth = waveformWidthSv.value;
          if (paneWidth <= 0) {
            return;
          }

          if (origin.mode === 1 || origin.mode === 2 || origin.mode === 3) {
            const atMs =
              origin.viewStartMs +
              Math.max(0, event.x - LABEL_WIDTH) * origin.msPerPixel;
            let nextStartMs = origin.startMs;
            let nextEndMs = origin.endMs;
            if (origin.mode === 1) {
              const fromMs =
                origin.viewStartMs +
                Math.max(0, event.x - LABEL_WIDTH) * origin.msPerPixel -
                event.translationX * origin.msPerPixel;
              const left = Math.max(0, Math.min(fromMs, atMs));
              const right = Math.min(durationSv.value, Math.max(fromMs, atMs));
              nextStartMs = left;
              nextEndMs = Math.max(left + SELECTION_MIN_WIDTH_MS, right);
            } else if (origin.mode === 2) {
              nextStartMs = Math.max(
                0,
                Math.min(atMs, origin.endMs - SELECTION_MIN_WIDTH_MS),
              );
              nextEndMs = origin.endMs;
            } else {
              nextStartMs = origin.startMs;
              nextEndMs = Math.min(
                durationSv.value,
                Math.max(atMs, origin.startMs + SELECTION_MIN_WIDTH_MS),
              );
            }
            const last = lastSelectionSv.value;
            if (
              last.startMs === nextStartMs &&
              last.endMs === nextEndMs &&
              last.trackIndex === origin.trackIndex
            ) {
              return;
            }
            lastSelectionSv.value = {
              startMs: nextStartMs,
              endMs: nextEndMs,
              trackIndex: origin.trackIndex,
            };
            runOnJS(handleSelectionDrag)(
              nextStartMs,
              nextEndMs,
              origin.trackIndex,
            );
            return;
          }

          const viewportMs = paneWidth * origin.msPerPixel;
          const nextStart = clampViewStart(
            origin.viewStartMs - event.translationX * origin.msPerPixel,
            viewportMs,
            durationSv.value,
          );
          viewStartSv.value = nextStart;
          const shiftPx =
            (committedViewStartSv.value - nextStart) / origin.msPerPixel;
          contentShiftPx.value = shiftPx;
          panSampleSv.value += 1;
          if (panSampleSv.value % 12 === 0) {
            runOnJS(handlePanSample)(
              event.translationX,
              nextStart,
              committedViewStartSv.value,
              shiftPx,
              panSampleSv.value,
            );
          }
          const nextFollow =
            liveSv.value === 1 &&
            nextStart + viewportMs >= nowSv.value - LIVE_EDGE_MS
              ? 1
              : 0;
          if (nextFollow !== followLiveSv.value) {
            followLiveSv.value = nextFollow;
            runOnJS(handleFollowLiveChange)(nextFollow === 1);
          }
        })
        .onEnd(() => {
          const origin = panOriginSv.value;
          if (origin.mode === 1 || origin.mode === 2 || origin.mode === 3) {
            const last = lastSelectionSv.value;
            runOnJS(handleSelectionGestureEnd)(
              last.startMs,
              last.endMs,
              last.trackIndex,
              origin.mode,
            );
            return;
          }
          const paneWidth = waveformWidthSv.value;
          const perPx = msPerPixelSv.value || 1;
          const viewportMs = paneWidth * perPx;
          const nextStart = viewStartSv.value;
          const nextFollow =
            liveSv.value === 1 &&
            nextStart + viewportMs >= nowSv.value - LIVE_EDGE_MS;
          runOnJS(handlePanEnd)(nextStart, nextFollow);
        }),
    [
      committedViewStartSv,
      contentShiftPx,
      durationSv,
      followLiveSv,
      handleFollowLiveChange,
      handlePanEnd,
      handlePanSample,
      handleSelectionDrag,
      handleSelectionGestureEnd,
      lastSelectionSv,
      liveSv,
      msPerPixelSv,
      nowSv,
      panOriginSv,
      panSampleSv,
      selectingSv,
      setGesturing,
      viewStartSv,
      waveformWidthSv,
    ],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin((event) => {
          runOnJS(setGesturing)(true);
          pinchOriginSv.value = {
            viewStartMs: viewStartSv.value,
            msPerPixel: msPerPixelSv.value,
            focalX: Math.max(0, event.focalX - LABEL_WIDTH),
          };
        })
        .onUpdate((event) => {
          const paneWidth = waveformWidthSv.value;
          if (paneWidth <= 0 || event.scale <= 0) {
            return;
          }

          const origin = pinchOriginSv.value;
          const nextMsPerPixel = clampMsPerPixel(
            origin.msPerPixel / event.scale,
            paneWidth,
            durationSv.value,
          );
          const focalTime = origin.viewStartMs + origin.focalX * origin.msPerPixel;
          const viewportMs = paneWidth * nextMsPerPixel;
          const nextStart = clampViewStart(
            focalTime - origin.focalX * nextMsPerPixel,
            viewportMs,
            durationSv.value,
          );
          msPerPixelSv.value = nextMsPerPixel;
          viewStartSv.value = nextStart;
          runOnJS(handlePinchCommit)(nextMsPerPixel, nextStart);
        })
        .onEnd(() => {
          runOnJS(handlePinchEnd)(msPerPixelSv.value, viewStartSv.value);
        }),
    [
      contentShiftPx,
      durationSv,
      handlePinchCommit,
      handlePinchEnd,
      setGesturing,
      msPerPixelSv,
      pinchOriginSv,
      viewStartSv,
      waveformWidthSv,
    ],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .onEnd((event) => {
          runOnJS(handleTapSeek)(event.x, event.y);
        }),
    [handleTapSeek],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(Gesture.Exclusive(pan, tap), pinch),
    [pan, pinch, tap],
  );

  const waveformShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: contentShiftPx.value }],
  }));

  const playheadStyle = useAnimatedStyle(() => {
    const perPx = msPerPixelSv.value || 1;
    const paneWidth = waveformWidthSv.value;
    const rawX = LABEL_WIDTH + (playheadSv.value - viewStartSv.value) / perPx;
    const maxX = LABEL_WIDTH + paneWidth;
    const pastRight = rawX > maxX;
    const x = pastRight ? maxX : rawX;
    const visible = pastRight || (x >= LABEL_WIDTH - 1 && x <= maxX + 1);
    return {
      opacity: visible ? 1 : 0,
      transform: [{ translateX: x }],
    };
  });

  const liveEdgeStyle = useAnimatedStyle(() => {
    const perPx = msPerPixelSv.value || 1;
    const paneWidth = waveformWidthSv.value;
    const rawX = LABEL_WIDTH + (nowSv.value - viewStartSv.value) / perPx;
    const maxX = LABEL_WIDTH + paneWidth;
    const pastRight = rawX > maxX;
    const x = pastRight ? maxX : rawX;
    const visible = pastRight || (x >= LABEL_WIDTH - 1 && x <= maxX + 1);
    return {
      opacity: visible ? 1 : 0,
      transform: [{ translateX: x }],
    };
  });

  const tracksHeight = Math.min(
    Math.max(tracks.length, 1) * TRACK_HEIGHT,
    MAX_TRACKS_VISIBLE * TRACK_HEIGHT,
  );
  const selectionX =
    selection && waveformWidth > 0
      ? (selection.startMs - viewStartMs) / msPerPixel
      : 0;
  const selectionWidth =
    selection && waveformWidth > 0
      ? (selection.endMs - selection.startMs) / msPerPixel
      : 0;
  const drawWidth = waveformWidth + overscanPx * 2;
  const drawStartMs = viewStartMs - overscanPx * msPerPixel;

  async function resolvePlaybackSegments(): Promise<RecordingSegment[]> {
    if (!onPreparePlayback) {
      return readySegments;
    }

    try {
      return await onPreparePlayback(readySegments);
    } catch {
      return readySegments;
    }
  }

  async function handlePlayPause() {
    if (playing) {
      clockRef.current.pause();
      setPlaying(false);
      return;
    }

    if (!canPlay) {
      return;
    }

    const selectedAnnotation = annotations.find(
      (item) => item.id === selectedAnnotationId,
    );
    const playRange = selection
      ? selection
      : selectedAnnotation && selectedAnnotation.endMs > selectedAnnotation.startMs
        ? selectedAnnotation
        : null;
    const playhead = Number.isFinite(playheadSv.value)
      ? playheadSv.value
      : playheadMsRef.current;
    const durationEnd = frozenDurationMs ?? durationMs;
    const insideRange =
      playRange !== null &&
      playhead >= playRange.startMs &&
      playhead < playRange.endMs;
    const startMs = playhead;
    const untilMs = insideRange ? playRange.endMs : durationEnd;
    setFollowLive(false);
    setCatchup('off');
    setRidingSinceMs(null);
    replayActiveRef.current?.(true);
    playheadSv.value = startMs;
    setPlayheadMs(startMs);
    playingRef.current = true;
    setPlaying(true);
    const segments = await resolvePlaybackSegments();
    if (!playingRef.current) {
      return;
    }
    playingSegmentsRef.current = segments;
    clockRef.current.play({
      playheadMs: startMs,
      untilMs,
      segments,
      soloUserId,
      playbackRate: 1,
      onPlayhead: (next) => {
        playheadSv.value = next;
        setPlayheadMs(next);
      },
      onEnded: () => {
        setPlaying(false);
      },
    });
  }

  async function handleReturnToLive() {
    if (!canPlay) {
      setFollowLive(true);
      setCatchup('off');
      replayActiveRef.current?.(false);
      return;
    }

    setFollowLive(false);
    setCatchup('catching');
    setRidingSinceMs(null);
    replayActiveRef.current?.(true);
    playingRef.current = true;
    setPlaying(true);
    const segments = await resolvePlaybackSegments();
    if (!playingRef.current) {
      return;
    }
    playingSegmentsRef.current = segments;
    clockRef.current.play({
      playheadMs: Number.isFinite(playheadSv.value)
        ? playheadSv.value
        : playheadMsRef.current,
      untilMs: nowMs,
      segments,
      soloUserId,
      playbackRate: CATCHUP_RATE,
      onPlayhead: (next) => {
        playheadSv.value = next;
        setPlayheadMs(next);
      },
      onEnded: () => {
        setPlaying(false);
        setCatchup('off');
      },
    });
  }

  function handleJumpToLive() {
    clockRef.current.pause();
    setPlaying(false);
    setCatchup('off');
    setRidingSinceMs(null);
    playheadSv.value = nowMs;
    setPlayheadMs(nowMs);
    setFollowLive(true);
    replayActiveRef.current?.(false);
    onSafeJoinConsumed?.();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {header}
      </View>
      <View style={styles.transport}>
        <Pressable
          style={[styles.transportButton, !canPlay && styles.transportDisabled]}
          disabled={!canPlay}
          onPress={handlePlayPause}
        >
          <Text style={styles.transportText}>{playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable
          style={[styles.transportButton, selecting && styles.transportActive]}
          onPress={() => {
            setSelecting((current) => !current);
          }}
        >
          <Text style={styles.transportText}>
            {selecting ? 'Selecting' : 'Select'}
          </Text>
        </Pressable>
        {profiles.length > 0 ? (
          <ProfilePickerButton
            profiles={profiles}
            onChoose={(profile) => {
              const momentMs =
                followLive && live && frozenDurationMs === null
                  ? nowMs
                  : playheadMs;
              onCreateAnnotation?.({
                profileId: profile.id,
                selection,
                startMs: selection ? selection.startMs : momentMs,
                endMs: selection ? selection.endMs : momentMs,
                userId: selection
                  ? selection.scope.kind === 'channel'
                    ? selection.scope.userId
                    : null
                  : null,
              });
            }}
          />
        ) : null}
        {selection && selectedAnnotationId ? (
          <Pressable
            style={styles.transportButton}
            onPress={() => onAttachSelection?.(selection)}
          >
            <Text style={styles.transportText}>Link</Text>
          </Pressable>
        ) : null}
        {selection ? (
          <Pressable
            style={styles.transportButton}
            onPress={() => {
              const current = selection;
              setSelection(null);
              onSelectionClear?.(current);
            }}
          >
            <Text style={styles.transportText}>Clear</Text>
          </Pressable>
        ) : null}
        {soloUserId ? (
          <Pressable
            style={styles.transportButton}
            onPress={() => setSoloUserId(null)}
          >
            <Text style={styles.transportText}>All tracks</Text>
          </Pressable>
        ) : null}
        {live && frozenDurationMs === null && !followLive ? (
          <Pressable style={styles.transportButton} onPress={handleReturnToLive}>
            <Text style={styles.transportText}>
              {catchup === 'catching'
                ? 'Catching up'
                : catchup === 'riding'
                  ? 'At edge'
                  : 'Return to live'}
            </Text>
          </Pressable>
        ) : null}
        {live && frozenDurationMs === null && !followLive ? (
          <Pressable
            style={[
              styles.liveButton,
              catchup === 'riding' &&
                ridingSinceMs !== null &&
                nowMs - ridingSinceMs > 30_000 &&
                styles.liveButtonActive,
            ]}
            onPress={handleJumpToLive}
          >
            <Text style={styles.liveButtonText}>Jump to live</Text>
          </Pressable>
        ) : null}
        {live && frozenDurationMs === null && followLive ? (
          <Pressable style={[styles.liveButton, styles.liveButtonActive]}>
            <Text style={[styles.liveButtonText, styles.liveButtonTextActive]}>
              Live
            </Text>
          </Pressable>
        ) : null}
      </View>
      <GestureDetector gesture={composed}>
        <View
          style={styles.timeline}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.rulerRow}>
            <View style={styles.rulerGutter} />
            <View style={[styles.rulerClip, { width: waveformWidth }]}>
              <Animated.View
                style={[
                  { width: drawWidth, marginLeft: -overscanPx },
                  waveformShiftStyle,
                ]}
              >
                <TimelineRuler
                  width={drawWidth}
                  height={RULER_HEIGHT}
                  viewStartMs={drawStartMs}
                  msPerPixel={msPerPixel}
                />
              </Animated.View>
            </View>
          </View>
          <ScrollView
            style={{ maxHeight: tracksHeight || TRACK_HEIGHT }}
            nestedScrollEnabled
          >
            {tracks.length === 0 ? (
              <View style={styles.emptyTrack}>
                <Text style={styles.emptyText}>Waiting for participants…</Text>
              </View>
            ) : (
              tracks.map((track) => (
                <ParticipantTrack
                  key={track.userId}
                  track={track}
                  width={width}
                  viewStartMs={viewStartMs}
                  msPerPixel={msPerPixel}
                  callStartedAtMs={startedAtMs}
                  overscanPx={overscanPx}
                  shiftStyle={waveformShiftStyle}
                  solo={soloUserId === track.userId}
                  onPressLabel={handleSolo}
                />
              ))
            )}
          </ScrollView>
          <View pointerEvents="none" style={styles.playheadLayer}>
            {selection && selectionWidth > 0 ? (
              <View
                style={[
                  styles.waveformOverlay,
                  { left: LABEL_WIDTH, width: waveformWidth },
                ]}
              >
                <Animated.View
                  style={[StyleSheet.absoluteFill, waveformShiftStyle]}
                >
                  <Svg width={waveformWidth} height={RULER_HEIGHT + tracksHeight}>
                    <Rect
                      x={selectionX}
                      y={
                        selection.scope.kind === 'channel'
                          ? RULER_HEIGHT +
                            Math.max(
                              0,
                              tracks.findIndex(
                                (track) =>
                                  track.userId === selection.scope.userId,
                              ),
                            ) *
                              TRACK_HEIGHT
                          : 0
                      }
                      width={selectionWidth}
                      height={
                        selection.scope.kind === 'channel'
                          ? TRACK_HEIGHT
                          : RULER_HEIGHT + tracksHeight
                      }
                      fill="#22c55e"
                      opacity={0.2}
                    />
                  </Svg>
                </Animated.View>
              </View>
            ) : null}
            <Animated.View
              style={[
                styles.playhead,
                { height: RULER_HEIGHT + tracksHeight },
                playheadStyle,
              ]}
            />
            {live && frozenDurationMs === null ? (
              <Animated.View
                style={[
                  styles.playhead,
                  styles.liveEdge,
                  { height: RULER_HEIGHT + tracksHeight },
                  liveEdgeStyle,
                ]}
              />
            ) : null}
          </View>
          {selection && selectionWidth > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.waveformOverlay,
                { left: LABEL_WIDTH, width: waveformWidth },
              ]}
            >
              <Animated.View
                style={[StyleSheet.absoluteFill, waveformShiftStyle]}
              >
                <View
                  style={[
                    styles.handle,
                    {
                      left: selectionX - 2,
                      top:
                        selection.scope.kind === 'channel'
                          ? RULER_HEIGHT +
                            Math.max(
                              0,
                              tracks.findIndex(
                                (track) =>
                                  track.userId === selection.scope.userId,
                              ),
                            ) *
                              TRACK_HEIGHT
                          : 0,
                      height:
                        selection.scope.kind === 'channel'
                          ? TRACK_HEIGHT
                          : RULER_HEIGHT + tracksHeight,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.handle,
                    {
                      left: selectionX + selectionWidth - 2,
                      top:
                        selection.scope.kind === 'channel'
                          ? RULER_HEIGHT +
                            Math.max(
                              0,
                              tracks.findIndex(
                                (track) =>
                                  track.userId === selection.scope.userId,
                              ),
                            ) *
                              TRACK_HEIGHT
                          : 0,
                      height:
                        selection.scope.kind === 'channel'
                          ? TRACK_HEIGHT
                          : RULER_HEIGHT + tracksHeight,
                    },
                  ]}
                />
              </Animated.View>
            </View>
          ) : null}
          <AnnotationMarkers
            annotations={annotations}
            selectedId={selectedAnnotationId}
            width={width}
            viewStartMs={viewStartMs}
            msPerPixel={msPerPixel}
            tracks={tracks}
            tracksHeight={tracksHeight}
            shiftStyle={waveformShiftStyle}
            onSelect={(id) => onSelectAnnotation?.(id)}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#14532d',
    borderBottomWidth: 1,
    borderBottomColor: '#166534',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  transportButton: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  transportActive: {
    backgroundColor: '#22c55e',
  },
  transportDisabled: {
    opacity: 0.5,
  },
  transportText: {
    color: '#dcfce7',
    fontWeight: '700',
    fontSize: 12,
  },
  liveButton: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginLeft: 'auto',
  },
  liveButtonActive: {
    backgroundColor: '#22c55e',
  },
  liveButtonText: {
    color: '#dcfce7',
    fontWeight: '700',
    fontSize: 12,
  },
  liveButtonTextActive: {
    color: '#052e16',
  },
  timeline: {
    position: 'relative',
  },
  rulerRow: {
    flexDirection: 'row',
    height: RULER_HEIGHT,
  },
  rulerGutter: {
    width: LABEL_WIDTH,
    backgroundColor: '#14532d',
  },
  rulerClip: {
    overflow: 'hidden',
  },
  emptyTrack: {
    height: TRACK_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#bbf7d0',
    fontSize: 13,
  },
  playheadLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  waveformOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: '#facc15',
  },
  liveEdge: {
    backgroundColor: '#ef4444',
  },
  handle: {
    position: 'absolute',
    width: 4,
    backgroundColor: '#86efac',
    borderRadius: 2,
  },
});
