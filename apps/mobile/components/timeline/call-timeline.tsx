import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Line, Rect, Svg } from 'react-native-svg';

import { CATCHUP_RATE, isAtReadyEdge } from '@/lib/call/catchup';
import { createPlaybackClock } from '@/lib/call/playback-clock';
import type { RecordingSegment } from '@/lib/call/playback-types';
import { ParticipantTrack, TRACK_HEIGHT } from './participant-track';
import {
  clampMsPerPixel,
  clampViewStart,
  DEFAULT_VIEWPORT_MS,
} from './timeline-math';
import type { TimelineTrack } from './timeline-model';
import { TimelineRuler } from './timeline-ruler';

const RULER_HEIGHT = 22;
const MAX_TRACKS_VISIBLE = 4;
const LIVE_EDGE_MS = 400;
const LABEL_WIDTH = 88;

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
  const [selection, setSelection] = useState<{ startMs: number; endMs: number } | null>(
    null,
  );
  const [soloUserId, setSoloUserId] = useState<string | null>(null);
  const [catchup, setCatchup] = useState<CatchupMode>('off');
  const [ridingSinceMs, setRidingSinceMs] = useState<number | null>(null);
  const panOrigin = useRef({ viewStartMs: 0, msPerPixel: 30, selection: false });
  const pinchOrigin = useRef({
    viewStartMs: 0,
    msPerPixel: 30,
    focalX: 0,
  });
  const clockRef = useRef(createPlaybackClock());

  const waveformWidth = Math.max(0, width - LABEL_WIDTH);
  const durationMs = Math.max(
    frozenDurationMs ?? nowMs,
    DEFAULT_VIEWPORT_MS,
  );
  const readySegments = recordings.filter(
    (segment) => segment.status === 'ready' && segment.playbackUrl,
  );
  const canPlay = readySegments.length > 0;

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
      setNowMs(nextNow);

      if (playing || catchup !== 'off') {
        clockRef.current.update({
          segments: readySegments,
          untilMs: frozenDurationMs ?? nextNow,
        });
      }

      if (catchup !== 'off') {
        if (catchup === 'catching' && isAtReadyEdge(playheadMs, nextNow)) {
          clockRef.current.setPlaybackRate(1);
          setCatchup('riding');
          setRidingSinceMs(nextNow);
        }
        if (safeJoinLiveAtMs !== null) {
          clockRef.current.pause();
          setPlaying(false);
          setCatchup('off');
          setRidingSinceMs(null);
          setFollowLive(true);
          onReplayActiveChange?.(false);
          onSafeJoinConsumed?.();
        }
        return;
      }

      if (!followLive || waveformWidth <= 0 || playing) {
        return;
      }

      const viewportMs = waveformWidth * msPerPixel;
      setViewStartMs(
        clampViewStart(nextNow - viewportMs, viewportMs, nextNow),
      );
      setPlayheadMs(nextNow);
    }, 100);

    return () => clearInterval(timer);
  }, [
    catchup,
    followLive,
    frozenDurationMs,
    live,
    msPerPixel,
    onReplayActiveChange,
    onSafeJoinConsumed,
    playheadMs,
    playing,
    readySegments,
    safeJoinLiveAtMs,
    startedAtMs,
    waveformWidth,
  ]);

  useEffect(() => {
    const clock = clockRef.current;
    return () => {
      clock.dispose?.();
      clock.pause();
    };
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-8, 8])
        .onBegin(() => {
          panOrigin.current = {
            viewStartMs,
            msPerPixel,
            selection: selecting,
          };
        })
        .onUpdate((event) => {
          if (waveformWidth <= 0) {
            return;
          }

          if (panOrigin.current.selection) {
            const start = panOrigin.current.viewStartMs;
            const fromMs = start + Math.max(0, event.x - LABEL_WIDTH) * panOrigin.current.msPerPixel - event.translationX * panOrigin.current.msPerPixel;
            const toMs = start + Math.max(0, event.x - LABEL_WIDTH) * panOrigin.current.msPerPixel;
            const left = Math.max(0, Math.min(fromMs, toMs));
            const right = Math.min(durationMs, Math.max(fromMs, toMs));
            setSelection({ startMs: left, endMs: Math.max(left + 50, right) });
            setFollowLive(false);
            onReplayActiveChange?.(true);
            return;
          }

          const viewportMs = waveformWidth * panOrigin.current.msPerPixel;
          const nextStart = clampViewStart(
            panOrigin.current.viewStartMs - event.translationX * panOrigin.current.msPerPixel,
            viewportMs,
            durationMs,
          );
          setViewStartMs(nextStart);
          const viewEnd = nextStart + viewportMs;
          const nextFollow = live && viewEnd >= nowMs - LIVE_EDGE_MS;
          setFollowLive(nextFollow);
          if (nextFollow) {
            onReplayActiveChange?.(false);
          }
        }),
    [durationMs, live, msPerPixel, nowMs, selecting, viewStartMs, waveformWidth],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin((event) => {
          pinchOrigin.current = {
            viewStartMs,
            msPerPixel,
            focalX: Math.max(0, event.focalX - LABEL_WIDTH),
          };
        })
        .onUpdate((event) => {
          if (waveformWidth <= 0 || event.scale <= 0) {
            return;
          }

          const origin = pinchOrigin.current;
          const nextMsPerPixel = clampMsPerPixel(
            origin.msPerPixel / event.scale,
            waveformWidth,
            durationMs,
          );
          const focalTime = origin.viewStartMs + origin.focalX * origin.msPerPixel;
          const viewportMs = waveformWidth * nextMsPerPixel;
          setMsPerPixel(nextMsPerPixel);
          setViewStartMs(
            clampViewStart(focalTime - origin.focalX * nextMsPerPixel, viewportMs, durationMs),
          );
        }),
    [durationMs, msPerPixel, viewStartMs, waveformWidth],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((event) => {
          if (waveformWidth <= 0 || event.x < LABEL_WIDTH) {
            return;
          }

          const nextPlayhead = Math.max(
            0,
            Math.min(durationMs, viewStartMs + (event.x - LABEL_WIDTH) * msPerPixel),
          );
          setPlayheadMs(nextPlayhead);
          setFollowLive(false);
          onReplayActiveChange?.(true);
          if (playing) {
            clockRef.current.pause();
            setPlaying(false);
          }
        }),
    [durationMs, msPerPixel, playing, viewStartMs, waveformWidth],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(Gesture.Exclusive(tap, pan), pinch),
    [pan, pinch, tap],
  );

  const cursorMs = followLive && live && frozenDurationMs === null ? nowMs : playheadMs;
  const playheadX =
    waveformWidth > 0 ? (cursorMs - viewStartMs) / msPerPixel : -1;
  const showPlayhead = playheadX >= 0 && playheadX <= waveformWidth;
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

  function handlePlayPause() {
    if (playing) {
      clockRef.current.pause();
      setPlaying(false);
      return;
    }

    if (!canPlay) {
      return;
    }

    const startMs = selection ? selection.startMs : cursorMs;
    const untilMs = selection ? selection.endMs : frozenDurationMs ?? durationMs;
    setFollowLive(false);
    setCatchup('off');
    setRidingSinceMs(null);
    onReplayActiveChange?.(true);
    setPlayheadMs(startMs);
    setPlaying(true);
    clockRef.current.play({
      playheadMs: startMs,
      untilMs,
      segments: readySegments,
      soloUserId,
      playbackRate: 1,
      onPlayhead: (next) => {
        setPlayheadMs(next);
      },
      onEnded: () => {
        setPlaying(false);
      },
    });
  }

  function handleReturnToLive() {
    if (!canPlay) {
      setFollowLive(true);
      setCatchup('off');
      onReplayActiveChange?.(false);
      return;
    }

    setFollowLive(false);
    setCatchup('catching');
    setRidingSinceMs(null);
    onReplayActiveChange?.(true);
    setPlaying(true);
    clockRef.current.play({
      playheadMs: cursorMs,
      untilMs: nowMs,
      segments: readySegments,
      soloUserId,
      playbackRate: CATCHUP_RATE,
      onPlayhead: (next) => {
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
    setFollowLive(true);
    onReplayActiveChange?.(false);
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
            if (selecting) {
              setSelection(null);
            }
          }}
        >
          <Text style={styles.transportText}>
            {selecting ? 'Selecting' : 'Select'}
          </Text>
        </Pressable>
        {selection ? (
          <Pressable
            style={styles.transportButton}
            onPress={() => setSelection(null)}
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
            <TimelineRuler
              width={waveformWidth}
              height={RULER_HEIGHT}
              viewStartMs={viewStartMs}
              msPerPixel={msPerPixel}
            />
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
                  solo={soloUserId === track.userId}
                  onPressLabel={() =>
                    setSoloUserId((current) =>
                      current === track.userId ? null : track.userId,
                    )
                  }
                />
              ))
            )}
          </ScrollView>
          <View pointerEvents="none" style={styles.playheadLayer}>
            <Svg width={width} height={RULER_HEIGHT + tracksHeight}>
              {selection && selectionWidth > 0 ? (
                <Rect
                  x={LABEL_WIDTH + selectionX}
                  y={0}
                  width={selectionWidth}
                  height={RULER_HEIGHT + tracksHeight}
                  fill="#22c55e"
                  opacity={0.2}
                />
              ) : null}
              {showPlayhead ? (
                <Line
                  x1={LABEL_WIDTH + playheadX}
                  y1={0}
                  x2={LABEL_WIDTH + playheadX}
                  y2={RULER_HEIGHT + tracksHeight}
                  stroke="#facc15"
                  strokeWidth={1.5}
                />
              ) : null}
            </Svg>
          </View>
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
});
