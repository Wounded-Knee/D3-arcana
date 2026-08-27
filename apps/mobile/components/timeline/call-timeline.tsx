import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
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
import { ParticipantTrack } from './participant-track';
import { ProfilePickerButton } from './profile-picker';
import {
  LABEL_HEIGHT,
  LABEL_WIDTH,
  MINIMAP_THICKNESS,
  RULER_GUTTER,
  RULER_HEIGHT,
  TRACK_HEIGHT,
  TRACK_WIDTH,
  paneSizePx,
  timeGutterPx,
  type TimelineOrientation,
} from './timeline-layout';
import {
  clampMsPerPixel,
  clampViewStart,
  DEFAULT_VIEWPORT_MS,
  followPlayheadViewStart,
  OVERSCAN_PX,
  timeForMinimapPx,
} from './timeline-math';
import {
  TIMELINE_ACCENT,
  TIMELINE_BG,
  TIMELINE_LIVE_EDGE,
  TIMELINE_PLAYHEAD,
} from './timeline-colors';
import { TimelineMinimap } from './timeline-minimap';
import type {
  ChannelScope,
  TimelineAnnotation,
  TimelineAnnotationProfile,
  TimelineSelection,
  TimelineTrack,
} from './timeline-model';
import { snapSelectionEdges, SELECTION_MIN_WIDTH_MS } from './timeline-snap';
import { TimelineRuler } from './timeline-ruler';

const MAX_TRACKS_VISIBLE = 4;
const LIVE_EDGE_MS = 400;
const VIEW_COMMIT_MS = 32;
const HANDLE_HIT_PX = 24;
const SELECT_LONG_PRESS_MS = 400;
const SELECT_DRAG_MIN_PX = 8;

type CatchupMode = 'off' | 'catching' | 'riding';

type CallTimelineProps = {
  startedAt: string;
  endedAt?: string | null;
  tracks: TimelineTrack[];
  header: ReactNode;
  inspect?: ReactNode;
  orientation?: TimelineOrientation;
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
  inspect,
  orientation = 'horizontal',
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
  const [height, setHeight] = useState(0);
  const vertical = orientation === 'vertical';
  const timeGutter = timeGutterPx(orientation);
  const rulerCross = vertical ? RULER_GUTTER : RULER_HEIGHT;
  const trackBreadth = vertical ? TRACK_WIDTH : TRACK_HEIGHT;
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
  const paneSizeSv = useSharedValue(0);
  const isVerticalSv = useSharedValue(vertical ? 1 : 0);
  const timeGutterSv = useSharedValue(timeGutter);
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
  const selectMovedSv = useSharedValue(0);
  const selectionRef = useRef<TimelineSelection | null>(null);
  selectionRef.current = selection;
  const tracksDuringPanRef = useRef(tracks);
  const pinchOriginSv = useSharedValue({
    viewStartMs: 0,
    msPerPixel: 30,
    focal: 0,
  });
  const minimapPanOriginSv = useSharedValue({ viewStartMs: 0 });

  const paneSize = paneSizePx(orientation, width, height);
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
  const overscanPx = Math.max(paneSize, OVERSCAN_PX);

  useEffect(() => {
    paneSizeSv.value = paneSize;
  }, [paneSize, paneSizeSv]);

  useEffect(() => {
    isVerticalSv.value = vertical ? 1 : 0;
    timeGutterSv.value = timeGutter;
  }, [isVerticalSv, timeGutter, timeGutterSv, vertical]);

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
          ? tracks.findIndex(
              (track) =>
                selection.scope.kind === 'channel' &&
                track.userId === selection.scope.userId,
            )
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
      contentShiftPx.value = nextShiftPx;
      return;
    }

    if (followLiveRef.current && liveSv.value === 1) {
      contentShiftPx.value = 0;
      return;
    }

    if (playingRef.current) {
      contentShiftPx.value = nextShiftPx;
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
    if (paneSize <= 0) {
      return;
    }

    setMsPerPixel((current) => clampMsPerPixel(current, paneSize, durationMs));
  }, [durationMs, paneSize]);

  useEffect(() => {
    if (
      paneSize <= 0 ||
      !followLiveRef.current ||
      !live ||
      frozenDurationMs !== null
    ) {
      return;
    }

    const nextMsPerPixel = clampMsPerPixel(msPerPixel, paneSize, durationMs);
    const viewportMs = paneSize * nextMsPerPixel;
    const liveNow = Math.max(0, Date.now() - startedAtMs);
    const nextStart = clampViewStart(
      liveNow - viewportMs,
      viewportMs,
      liveNow,
    );
    viewStartSv.value = nextStart;
    setViewStartMs(nextStart);
  }, [frozenDurationMs, live, msPerPixel, orientation, paneSize, startedAtMs, viewStartSv]);

  useEffect(() => {
    if (!live || frozenDurationMs !== null) {
      return;
    }

    const timer = setInterval(() => {
      const nextNow = Math.max(0, Date.now() - startedAtMs);
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
          playingRef.current = false;
          setPlaying(false);
          setCatchup('off');
          setRidingSinceMs(null);
          playheadSv.value = nextNow;
          setPlayheadMs(nextNow);
          setFollowLive(true);
          contentShiftPx.value = 0;
          replayActiveRef.current?.(false);
          onSafeJoinConsumedRef.current?.();
        }
        return;
      }

      const paneWidth = paneSizeSv.value;
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
      tracksDuringPanRef.current = tracks;
    }
  }, [tracks]);

  const commitViewStart = useCallback((nextStart: number, immediate: boolean) => {
    pendingViewStartRef.current = nextStart;
    if (immediate) {
      if (viewCommitTimer.current) {
        clearTimeout(viewCommitTimer.current);
        viewCommitTimer.current = null;
      }
      setViewStartMs(nextStart);
      return;
    }

    if (viewCommitTimer.current) {
      return;
    }

    viewCommitTimer.current = setTimeout(() => {
      viewCommitTimer.current = null;
      setViewStartMs(pendingViewStartRef.current);
    }, VIEW_COMMIT_MS);
  }, []);

  const applyPlayhead = useCallback((next: number) => {
    playheadSv.value = next;
    setPlayheadMs(next);
    if (gesturingRef.current) {
      return;
    }

    const pane = paneSizeSv.value;
    const perPx = msPerPixelSv.value || 1;
    if (pane <= 0) {
      return;
    }

    const viewportMs = pane * perPx;
    const currentStart = viewStartSv.value;
    const nextStart = followPlayheadViewStart(
      currentStart,
      next,
      viewportMs,
      durationSv.value,
    );
    if (nextStart === currentStart) {
      return;
    }

    viewStartSv.value = nextStart;
    contentShiftPx.value = (committedViewStartSv.value - nextStart) / perPx;
    commitViewStart(nextStart, false);
  }, [
    commitViewStart,
    committedViewStartSv,
    contentShiftPx,
    durationSv,
    msPerPixelSv,
    paneSizeSv,
    playheadSv,
    viewStartSv,
  ]);

  const stopPlaybackView = useCallback(() => {
    contentShiftPx.value = 0;
    commitViewStart(viewStartSv.value, true);
  }, [commitViewStart, contentShiftPx, viewStartSv]);

  const setGesturing = useCallback((value: boolean) => {
    gesturingRef.current = value;
  }, []);

  const handleSelectModeStart = useCallback(() => {
    setSelecting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  }, []);

  const handleFollowLiveChange = useCallback((nextFollow: boolean) => {
    if (followLiveRef.current === nextFollow) {
      return;
    }
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
      gesturingRef.current = false;
      commitViewStart(nextStart, true);
      handleFollowLiveChange(nextFollow);
    },
    [commitViewStart, handleFollowLiveChange],
  );

  const handleMinimapJump = useCallback(
    (alongPx: number) => {
      const pane = paneSizeSv.value;
      const duration = durationSv.value;
      const perPx = msPerPixelSv.value || 1;
      if (pane <= 0 || duration <= 0) {
        return;
      }

      const atMs = timeForMinimapPx(alongPx, duration, pane);
      const viewportMs = pane * perPx;
      const nextStart = clampViewStart(
        atMs - viewportMs / 2,
        viewportMs,
        duration,
      );
      viewStartSv.value = nextStart;
      contentShiftPx.value = 0;
      commitViewStart(nextStart, true);
      followLiveSv.value = 0;
      handleFollowLiveChange(false);
      replayActiveRef.current?.(true);
    },
    [
      commitViewStart,
      contentShiftPx,
      durationSv,
      followLiveSv,
      handleFollowLiveChange,
      msPerPixelSv,
      paneSizeSv,
      viewStartSv,
    ],
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
      commitViewStart(nextStart, false);
      setFollowLive(false);
    },
    [commitViewStart],
  );

  const handlePinchEnd = useCallback(
    (nextMsPerPixel: number, nextStart: number) => {
      gesturingRef.current = false;
      setMsPerPixel(nextMsPerPixel);
      commitViewStart(nextStart, true);
    },
    [commitViewStart],
  );

  const handleTapSeek = useCallback((x: number, y: number) => {
    if (paneSizeSv.value <= 0) {
      return;
    }

    const along = vertical ? y : x;
    const across = vertical ? x : y;
    if (along < timeGutter) {
      return;
    }
    if (
      across >= rulerCross &&
      across < rulerCross + MINIMAP_THICKNESS
    ) {
      return;
    }

    const atMs =
      viewStartSv.value + (along - timeGutter) * msPerPixelSv.value;
    const tracksCrossStart = rulerCross + MINIMAP_THICKNESS;
    const hit = annotations.find((annotation) => {
      const isPoint = annotation.endMs <= annotation.startMs;
      const pad = isPoint ? 400 : 0;
      const start = annotation.startMs - pad / 2;
      const end = annotation.endMs + pad / 2;
      if (atMs < start || atMs > end) {
        return false;
      }
      if (annotation.scope.kind === 'all') {
        return (
          across < rulerCross ||
          across >= tracksCrossStart
        );
      }
      const channelUserId = annotation.scope.userId;
      const index = tracks.findIndex(
        (track) => track.userId === channelUserId,
      );
      if (index < 0) {
        return false;
      }
      const startAcross = tracksCrossStart + index * trackBreadth;
      return across >= startAcross && across <= startAcross + trackBreadth;
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
      playingRef.current = false;
      setPlaying(false);
      stopPlaybackView();
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
    stopPlaybackView,
    tracks,
    viewStartSv,
    paneSizeSv,
    rulerCross,
    timeGutter,
    trackBreadth,
    vertical,
  ]);

  const handleSolo = useCallback((userId: string) => {
    setSoloUserId((current) => (current === userId ? null : userId));
  }, []);

  const pan = useMemo(
    () => {
      'use no memo';
      const gesture = vertical
        ? Gesture.Pan().activeOffsetY([-8, 8])
        : Gesture.Pan().activeOffsetX([-8, 8]);
      return gesture
        .onBegin((event) => {
          'worklet';
          runOnJS(setGesturing)(true);
          const last = lastSelectionSv.value;
          const perPx = msPerPixelSv.value || 1;
          const alongStart =
            timeGutter + (last.startMs - viewStartSv.value) / perPx;
          const alongEnd =
            timeGutter + (last.endMs - viewStartSv.value) / perPx;
          const handleCrossStart =
            last.trackIndex >= 0
              ? rulerCross + MINIMAP_THICKNESS + last.trackIndex * trackBreadth
              : 0;
          const handleCrossEnd =
            last.trackIndex >= 0
              ? handleCrossStart + trackBreadth
              : rulerCross + MINIMAP_THICKNESS + MAX_TRACKS_VISIBLE * trackBreadth;
          const along = vertical ? event.y : event.x;
          const across = vertical ? event.x : event.y;
          const onHandleCross =
            last.startMs >= 0 &&
            across >= handleCrossStart &&
            across <= handleCrossEnd;
          let mode = 0;
          if (onHandleCross && last.startMs >= 0) {
            if (Math.abs(along - alongStart) <= HANDLE_HIT_PX) {
              mode = 2;
            } else if (Math.abs(along - alongEnd) <= HANDLE_HIT_PX) {
              mode = 3;
            }
          }
          let trackIndex = last.trackIndex;
          if (mode === 0 && selectingSv.value) {
            mode = 1;
            trackIndex =
              across < rulerCross + MINIMAP_THICKNESS
                ? -1
                : Math.floor(
                    (across - rulerCross - MINIMAP_THICKNESS) / trackBreadth,
                  );
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
          'worklet';
          const origin = panOriginSv.value;
          const pane = paneSizeSv.value;
          if (pane <= 0) {
            return;
          }

          const along = vertical ? event.y : event.x;
          const translation = vertical ? event.translationY : event.translationX;

          if (origin.mode === 1 || origin.mode === 2 || origin.mode === 3) {
            const atMs =
              origin.viewStartMs +
              Math.max(0, along - timeGutter) * origin.msPerPixel;
            let nextStartMs = origin.startMs;
            let nextEndMs = origin.endMs;
            if (origin.mode === 1) {
              const fromMs =
                origin.viewStartMs +
                Math.max(0, along - timeGutter) * origin.msPerPixel -
                translation * origin.msPerPixel;
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
            const lastSel = lastSelectionSv.value;
            if (
              lastSel.startMs !== nextStartMs ||
              lastSel.endMs !== nextEndMs ||
              lastSel.trackIndex !== origin.trackIndex
            ) {
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
            }
            return;
          }

          const viewportMs = pane * origin.msPerPixel;
          const nextStart = clampViewStart(
            origin.viewStartMs - translation * origin.msPerPixel,
            viewportMs,
            durationSv.value,
          );
          viewStartSv.value = nextStart;
          const shiftPx =
            (committedViewStartSv.value - nextStart) / origin.msPerPixel;
          contentShiftPx.value = shiftPx;
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
          'worklet';
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
          const pane = paneSizeSv.value;
          const perPx = msPerPixelSv.value || 1;
          const viewportMs = pane * perPx;
          const nextStart = viewStartSv.value;
          const nextFollow =
            liveSv.value === 1 &&
            nextStart + viewportMs >= nowSv.value - LIVE_EDGE_MS;
          runOnJS(handlePanEnd)(nextStart, nextFollow);
        });
    },
    [
      committedViewStartSv,
      contentShiftPx,
      durationSv,
      followLiveSv,
      handleFollowLiveChange,
      handlePanEnd,
      handleSelectionDrag,
      handleSelectionGestureEnd,
      lastSelectionSv,
      liveSv,
      msPerPixelSv,
      nowSv,
      panOriginSv,
      rulerCross,
      selectingSv,
      setGesturing,
      timeGutter,
      trackBreadth,
      vertical,
      viewStartSv,
      paneSizeSv,
    ],
  );

  const selectPan = useMemo(
    () => {
      'use no memo';
      const gesture = vertical
        ? Gesture.Pan()
            .activateAfterLongPress(SELECT_LONG_PRESS_MS)
            .failOffsetY([-SELECT_DRAG_MIN_PX, SELECT_DRAG_MIN_PX])
        : Gesture.Pan()
            .activateAfterLongPress(SELECT_LONG_PRESS_MS)
            .failOffsetX([-SELECT_DRAG_MIN_PX, SELECT_DRAG_MIN_PX]);
      return gesture
        .onStart((event) => {
          'worklet';
          const along = vertical ? event.y : event.x;
          const across = vertical ? event.x : event.y;
          selectMovedSv.value = 0;
          if (
            along < timeGutter ||
            (across >= rulerCross &&
              across < rulerCross + MINIMAP_THICKNESS)
          ) {
            panOriginSv.value = {
              viewStartMs: viewStartSv.value,
              msPerPixel: msPerPixelSv.value,
              selection: 0,
              mode: 0,
              trackIndex: -1,
              startMs: -1,
              endMs: -1,
            };
            return;
          }
          runOnJS(setGesturing)(true);
          selectingSv.value = 1;
          runOnJS(handleSelectModeStart)();
          panOriginSv.value = {
            viewStartMs: viewStartSv.value,
            msPerPixel: msPerPixelSv.value,
            selection: 1,
            mode: 1,
            trackIndex:
              across < rulerCross + MINIMAP_THICKNESS
                ? -1
                : Math.floor(
                    (across - rulerCross - MINIMAP_THICKNESS) / trackBreadth,
                  ),
            startMs: -1,
            endMs: -1,
          };
        })
        .onUpdate((event) => {
          'worklet';
          const origin = panOriginSv.value;
          if (origin.mode !== 1 || paneSizeSv.value <= 0) {
            return;
          }
          const along = vertical ? event.y : event.x;
          const translation = vertical ? event.translationY : event.translationX;
          if (
            selectMovedSv.value === 0 &&
            Math.abs(translation) < SELECT_DRAG_MIN_PX
          ) {
            return;
          }
          selectMovedSv.value = 1;
          const atMs =
            origin.viewStartMs +
            Math.max(0, along - timeGutter) * origin.msPerPixel;
          const fromMs =
            origin.viewStartMs +
            Math.max(0, along - timeGutter) * origin.msPerPixel -
            translation * origin.msPerPixel;
          const left = Math.max(0, Math.min(fromMs, atMs));
          const right = Math.min(durationSv.value, Math.max(fromMs, atMs));
          const nextStartMs = left;
          const nextEndMs = Math.max(left + SELECTION_MIN_WIDTH_MS, right);
          const lastSel = lastSelectionSv.value;
          if (
            lastSel.startMs !== nextStartMs ||
            lastSel.endMs !== nextEndMs ||
            lastSel.trackIndex !== origin.trackIndex
          ) {
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
          }
        })
        .onEnd(() => {
          'worklet';
          const origin = panOriginSv.value;
          if (origin.mode === 1 && selectMovedSv.value) {
            const last = lastSelectionSv.value;
            runOnJS(handleSelectionGestureEnd)(
              last.startMs,
              last.endMs,
              last.trackIndex,
              origin.mode,
            );
            return;
          }
          runOnJS(setGesturing)(false);
        });
    },
    [
      durationSv,
      handleSelectModeStart,
      handleSelectionDrag,
      handleSelectionGestureEnd,
      lastSelectionSv,
      msPerPixelSv,
      panOriginSv,
      paneSizeSv,
      rulerCross,
      selectingSv,
      selectMovedSv,
      setGesturing,
      timeGutter,
      trackBreadth,
      vertical,
      viewStartSv,
    ],
  );

  const pinch = useMemo(
    () => {
      'use no memo';
      return Gesture.Pinch()
        .onBegin((event) => {
          'worklet';
          runOnJS(setGesturing)(true);
          const focalAlong = vertical ? event.focalY : event.focalX;
          pinchOriginSv.value = {
            viewStartMs: viewStartSv.value,
            msPerPixel: msPerPixelSv.value,
            focal: Math.max(0, focalAlong - timeGutter),
          };
        })
        .onUpdate((event) => {
          'worklet';
          const pane = paneSizeSv.value;
          if (pane <= 0 || event.scale <= 0) {
            return;
          }

          const origin = pinchOriginSv.value;
          const nextMsPerPixel = clampMsPerPixel(
            origin.msPerPixel / event.scale,
            pane,
            durationSv.value,
          );
          const focalTime = origin.viewStartMs + origin.focal * origin.msPerPixel;
          const viewportMs = pane * nextMsPerPixel;
          const nextStart = clampViewStart(
            focalTime - origin.focal * nextMsPerPixel,
            viewportMs,
            durationSv.value,
          );
          msPerPixelSv.value = nextMsPerPixel;
          viewStartSv.value = nextStart;
          runOnJS(handlePinchCommit)(nextMsPerPixel, nextStart);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(handlePinchEnd)(msPerPixelSv.value, viewStartSv.value);
        });
    },
    [
      contentShiftPx,
      durationSv,
      handlePinchCommit,
      handlePinchEnd,
      setGesturing,
      msPerPixelSv,
      pinchOriginSv,
      timeGutter,
      vertical,
      viewStartSv,
      paneSizeSv,
    ],
  );

  const tap = useMemo(
    () => {
      'use no memo';
      return Gesture.Tap()
        .onEnd((event) => {
          'worklet';
          runOnJS(handleTapSeek)(event.x, event.y);
        });
    },
    [handleTapSeek],
  );

  const minimapPan = useMemo(
    () => {
      'use no memo';
      const gesture = vertical
        ? Gesture.Pan().activeOffsetY([-8, 8])
        : Gesture.Pan().activeOffsetX([-8, 8]);
      return gesture
        .onBegin(() => {
          'worklet';
          runOnJS(setGesturing)(true);
          minimapPanOriginSv.value = { viewStartMs: viewStartSv.value };
        })
        .onUpdate((event) => {
          'worklet';
          const pane = paneSizeSv.value;
          const duration = durationSv.value;
          if (pane <= 0 || duration <= 0) {
            return;
          }

          const translation = vertical ? event.translationY : event.translationX;
          const origin = minimapPanOriginSv.value;
          const perPx = msPerPixelSv.value || 1;
          const viewportMs = pane * perPx;
          const nextStart = clampViewStart(
            origin.viewStartMs + translation * (duration / pane),
            viewportMs,
            duration,
          );
          viewStartSv.value = nextStart;
          contentShiftPx.value = (committedViewStartSv.value - nextStart) / perPx;
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
          'worklet';
          const pane = paneSizeSv.value;
          const perPx = msPerPixelSv.value || 1;
          const viewportMs = pane * perPx;
          const nextStart = viewStartSv.value;
          const nextFollow =
            liveSv.value === 1 &&
            nextStart + viewportMs >= nowSv.value - LIVE_EDGE_MS;
          runOnJS(handlePanEnd)(nextStart, nextFollow);
        });
    },
    [
      committedViewStartSv,
      contentShiftPx,
      durationSv,
      followLiveSv,
      handleFollowLiveChange,
      handlePanEnd,
      liveSv,
      minimapPanOriginSv,
      msPerPixelSv,
      nowSv,
      paneSizeSv,
      setGesturing,
      vertical,
      viewStartSv,
    ],
  );

  const minimapTap = useMemo(
    () => {
      'use no memo';
      return Gesture.Tap().onEnd((event) => {
        'worklet';
        const along = vertical ? event.y : event.x;
        runOnJS(handleMinimapJump)(along);
      });
    },
    [handleMinimapJump, vertical],
  );

  const composed = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Race(selectPan, Gesture.Exclusive(pan, tap)),
        pinch,
      ),
    [pan, pinch, selectPan, tap],
  );

  const minimapComposed = useMemo(
    () => Gesture.Exclusive(minimapPan, minimapTap),
    [minimapPan, minimapTap],
  );

  const waveformShiftStyle = useAnimatedStyle(() => ({
    transform:
      isVerticalSv.value === 1
        ? [{ translateY: contentShiftPx.value }]
        : [{ translateX: contentShiftPx.value }],
  }));

  const playheadStyle = useAnimatedStyle(() => {
    const perPx = msPerPixelSv.value || 1;
    const pane = paneSizeSv.value;
    const gutter = timeGutterSv.value;
    const raw = gutter + (playheadSv.value - viewStartSv.value) / perPx;
    const maxAlong = gutter + pane;
    const pastEnd = raw > maxAlong;
    const along = pastEnd ? maxAlong : raw;
    const visible = pastEnd || (along >= gutter - 1 && along <= maxAlong + 1);
    return {
      opacity: visible ? 1 : 0,
      transform:
        isVerticalSv.value === 1
          ? [{ translateY: along }]
          : [{ translateX: along }],
    };
  });

  const liveEdgeStyle = useAnimatedStyle(() => {
    const perPx = msPerPixelSv.value || 1;
    const pane = paneSizeSv.value;
    const gutter = timeGutterSv.value;
    const raw = gutter + (nowSv.value - viewStartSv.value) / perPx;
    const maxAlong = gutter + pane;
    const pastEnd = raw > maxAlong;
    const along = pastEnd ? maxAlong : raw;
    const visible = pastEnd || (along >= gutter - 1 && along <= maxAlong + 1);
    return {
      opacity: visible ? 1 : 0,
      transform:
        isVerticalSv.value === 1
          ? [{ translateY: along }]
          : [{ translateX: along }],
    };
  });

  const tracksCrossPx = vertical
    ? Math.max(tracks.length, 1) * TRACK_WIDTH
    : Math.min(
        Math.max(tracks.length, 1) * TRACK_HEIGHT,
        MAX_TRACKS_VISIBLE * TRACK_HEIGHT,
      );
  const selectionAlong =
    selection && paneSize > 0
      ? (selection.startMs - viewStartMs) / msPerPixel
      : 0;
  const selectionAlongSize =
    selection && paneSize > 0
      ? (selection.endMs - selection.startMs) / msPerPixel
      : 0;
  const drawLength = paneSize + overscanPx * 2;
  const drawStartMs = viewStartMs - overscanPx * msPerPixel;
  const selectionTrackIndex =
    selection?.scope.kind === 'channel'
      ? Math.max(
          0,
          tracks.findIndex((track) =>
            selection.scope.kind === 'channel' &&
            track.userId === selection.scope.userId,
          ),
        )
      : -1;
  const selectionCrossStart =
    selectionTrackIndex >= 0
      ? rulerCross + MINIMAP_THICKNESS + selectionTrackIndex * trackBreadth
      : 0;
  const selectionCrossSize =
    selectionTrackIndex >= 0
      ? trackBreadth
      : rulerCross + MINIMAP_THICKNESS + tracksCrossPx;

  const minimap = (
    <GestureDetector gesture={minimapComposed}>
      <View>
        <TimelineMinimap
          orientation={orientation}
          lengthPx={paneSize}
          durationMs={durationMs}
          annotations={annotations}
          showLiveEdge={live && frozenDurationMs === null}
          viewStartSv={viewStartSv}
          msPerPixelSv={msPerPixelSv}
          durationSv={durationSv}
          paneSizeSv={paneSizeSv}
          playheadSv={playheadSv}
          nowSv={nowSv}
        />
      </View>
    </GestureDetector>
  );

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
      playingRef.current = false;
      setPlaying(false);
      stopPlaybackView();
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
      onPlayhead: applyPlayhead,
      onEnded: () => {
        playingRef.current = false;
        setPlaying(false);
        stopPlaybackView();
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
      onPlayhead: applyPlayhead,
      onEnded: () => {
        playingRef.current = false;
        setPlaying(false);
        setCatchup('off');
        stopPlaybackView();
      },
    });
  }

  function handleJumpToLive() {
    clockRef.current.pause();
    playingRef.current = false;
    setPlaying(false);
    setCatchup('off');
    setRidingSinceMs(null);
    playheadSv.value = nowMs;
    setPlayheadMs(nowMs);
    setFollowLive(true);
    contentShiftPx.value = 0;
    replayActiveRef.current?.(false);
    onSafeJoinConsumed?.();
  }

  return (
    <View style={[styles.container, vertical && styles.containerFill]}>
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
      {inspect}
      <View style={vertical ? styles.timelineFill : undefined}>
      <GestureDetector gesture={composed}>
        <View
          style={[styles.timeline, vertical && styles.timelineFill]}
          onLayout={(event) => {
            setWidth(event.nativeEvent.layout.width);
            setHeight(event.nativeEvent.layout.height);
          }}
        >
          {vertical ? (
            <View style={styles.verticalBody}>
              <View style={[styles.verticalRuler, { height: LABEL_HEIGHT + paneSize }]}>
                <View style={styles.verticalCorner} />
                <View style={[styles.rulerClipFill, { height: paneSize }]}>
                  <Animated.View
                    style={[
                      { height: drawLength, marginTop: -overscanPx },
                      waveformShiftStyle,
                    ]}
                  >
                    <TimelineRuler
                      width={RULER_GUTTER}
                      height={drawLength}
                      viewStartMs={drawStartMs}
                      msPerPixel={msPerPixel}
                      orientation="vertical"
                    />
                  </Animated.View>
                </View>
              </View>
              <View
                style={[
                  styles.minimapColumn,
                  { height: LABEL_HEIGHT + paneSize },
                ]}
              >
                <View style={styles.verticalCorner} />
                {minimap}
              </View>
              <ScrollView
                horizontal
                nestedScrollEnabled
                style={styles.tracksScroll}
                contentContainerStyle={{ height: LABEL_HEIGHT + paneSize }}
              >
                {tracks.length === 0 ? (
                  <View
                    style={[
                      styles.emptyTrackVertical,
                      { height: LABEL_HEIGHT + paneSize },
                    ]}
                  >
                    <Text style={styles.emptyText}>Waiting for participants…</Text>
                  </View>
                ) : (
                  tracks.map((track) => (
                    <ParticipantTrack
                      key={track.userId}
                      track={track}
                      orientation="vertical"
                      paneSize={paneSize}
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
            </View>
          ) : (
            <>
              <View style={styles.rulerRow}>
                <View style={styles.rulerGutter} />
                <View style={[styles.rulerClip, { width: paneSize }]}>
                  <Animated.View
                    style={[
                      { width: drawLength, marginLeft: -overscanPx },
                      waveformShiftStyle,
                    ]}
                  >
                    <TimelineRuler
                      width={drawLength}
                      height={RULER_HEIGHT}
                      viewStartMs={drawStartMs}
                      msPerPixel={msPerPixel}
                    />
                  </Animated.View>
                </View>
              </View>
              <View style={styles.minimapRow}>
                <View style={styles.rulerGutter} />
                {minimap}
              </View>
              <ScrollView
                style={{ maxHeight: tracksCrossPx || TRACK_HEIGHT }}
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
                      orientation="horizontal"
                      paneSize={paneSize}
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
            </>
          )}
          <View pointerEvents="none" style={styles.playheadLayer}>
            {selection && selectionAlongSize > 0 ? (
              <View
                style={[
                  styles.waveformOverlay,
                  vertical
                    ? { top: LABEL_HEIGHT, height: paneSize, left: 0, right: 0 }
                    : { left: LABEL_WIDTH, width: paneSize },
                ]}
              >
                <Animated.View
                  style={[StyleSheet.absoluteFill, waveformShiftStyle]}
                >
                  <Svg
                    width={vertical ? rulerCross + tracksCrossPx : paneSize}
                    height={vertical ? paneSize : rulerCross + tracksCrossPx}
                  >
                    <Rect
                      x={vertical ? selectionCrossStart : selectionAlong}
                      y={vertical ? selectionAlong : selectionCrossStart}
                      width={vertical ? selectionCrossSize : selectionAlongSize}
                      height={vertical ? selectionAlongSize : selectionCrossSize}
                      fill="#22c55e"
                      opacity={0.2}
                    />
                  </Svg>
                </Animated.View>
              </View>
            ) : null}
            <Animated.View
              style={[
                vertical ? styles.playheadVertical : styles.playhead,
                !vertical && {
                  height: rulerCross + MINIMAP_THICKNESS + tracksCrossPx,
                },
                playheadStyle,
              ]}
            />
            {live && frozenDurationMs === null ? (
              <Animated.View
                style={[
                  vertical ? styles.playheadVertical : styles.playhead,
                  styles.liveEdge,
                  !vertical && {
                    height: rulerCross + MINIMAP_THICKNESS + tracksCrossPx,
                  },
                  liveEdgeStyle,
                ]}
              />
            ) : null}
          </View>
          {selection && selectionAlongSize > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.waveformOverlay,
                vertical
                  ? { top: LABEL_HEIGHT, height: paneSize, left: 0, right: 0 }
                  : { left: LABEL_WIDTH, width: paneSize },
              ]}
            >
              <Animated.View
                style={[StyleSheet.absoluteFill, waveformShiftStyle]}
              >
                <View
                  style={[
                    vertical ? styles.handleHorizontal : styles.handle,
                    vertical
                      ? {
                          top: selectionAlong - 2,
                          left: selectionCrossStart,
                          width: selectionCrossSize,
                        }
                      : {
                          left: selectionAlong - 2,
                          top: selectionCrossStart,
                          height: selectionCrossSize,
                        },
                  ]}
                />
                <View
                  style={[
                    vertical ? styles.handleHorizontal : styles.handle,
                    vertical
                      ? {
                          top: selectionAlong + selectionAlongSize - 2,
                          left: selectionCrossStart,
                          width: selectionCrossSize,
                        }
                      : {
                          left: selectionAlong + selectionAlongSize - 2,
                          top: selectionCrossStart,
                          height: selectionCrossSize,
                        },
                  ]}
                />
              </Animated.View>
            </View>
          ) : null}
          <AnnotationMarkers
            annotations={annotations}
            selectedId={selectedAnnotationId}
            orientation={orientation}
            paneSize={paneSize}
            viewStartMs={viewStartMs}
            msPerPixel={msPerPixel}
            tracks={tracks}
            tracksCrossPx={tracksCrossPx}
            shiftStyle={waveformShiftStyle}
            onSelect={(id) => onSelectAnnotation?.(id)}
          />
        </View>
      </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TIMELINE_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#166534',
  },
  containerFill: {
    flex: 1,
    borderBottomWidth: 0,
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
  timelineFill: {
    flex: 1,
  },
  rulerRow: {
    flexDirection: 'row',
    height: RULER_HEIGHT,
  },
  rulerGutter: {
    width: LABEL_WIDTH,
    backgroundColor: TIMELINE_BG,
  },
  minimapRow: {
    flexDirection: 'row',
    height: MINIMAP_THICKNESS,
    zIndex: 3,
  },
  minimapColumn: {
    width: MINIMAP_THICKNESS,
    zIndex: 3,
  },
  rulerClip: {
    overflow: 'hidden',
  },
  rulerClipFill: {
    flex: 1,
    overflow: 'hidden',
  },
  verticalBody: {
    flex: 1,
    flexDirection: 'row',
  },
  verticalRuler: {
    width: RULER_GUTTER,
    backgroundColor: TIMELINE_BG,
  },
  verticalCorner: {
    height: LABEL_HEIGHT,
    backgroundColor: TIMELINE_BG,
  },
  tracksScroll: {
    flex: 1,
  },
  emptyTrack: {
    height: TRACK_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyTrackVertical: {
    minWidth: 180,
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
    backgroundColor: TIMELINE_PLAYHEAD,
  },
  playheadVertical: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    marginTop: -1,
    backgroundColor: TIMELINE_PLAYHEAD,
  },
  liveEdge: {
    backgroundColor: TIMELINE_LIVE_EDGE,
  },
  handle: {
    position: 'absolute',
    width: 4,
    backgroundColor: TIMELINE_ACCENT,
    borderRadius: 2,
  },
  handleHorizontal: {
    position: 'absolute',
    height: 4,
    backgroundColor: TIMELINE_ACCENT,
    borderRadius: 2,
  },
});
