import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Line, Svg } from 'react-native-svg';

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

type CallTimelineProps = {
  startedAt: string;
  tracks: TimelineTrack[];
  header: ReactNode;
};

export function CallTimeline({ startedAt, tracks, header }: CallTimelineProps) {
  const startedAtMs = Date.parse(startedAt);
  const [width, setWidth] = useState(0);
  const [nowMs, setNowMs] = useState(() => Math.max(0, Date.now() - startedAtMs));
  const [viewStartMs, setViewStartMs] = useState(0);
  const [msPerPixel, setMsPerPixel] = useState(30);
  const [followLive, setFollowLive] = useState(true);
  const panOrigin = useRef({ viewStartMs: 0, msPerPixel: 30 });
  const pinchOrigin = useRef({
    viewStartMs: 0,
    msPerPixel: 30,
    focalX: 0,
  });

  const waveformWidth = Math.max(0, width - LABEL_WIDTH);
  const durationMs = Math.max(nowMs, DEFAULT_VIEWPORT_MS);

  useEffect(() => {
    if (waveformWidth <= 0) {
      return;
    }

    setMsPerPixel((current) =>
      clampMsPerPixel(current, waveformWidth, durationMs),
    );
  }, [durationMs, waveformWidth]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = Math.max(0, Date.now() - startedAtMs);
      setNowMs(nextNow);

      if (!followLive || waveformWidth <= 0) {
        return;
      }

      const viewportMs = waveformWidth * msPerPixel;
      setViewStartMs(
        clampViewStart(nextNow - viewportMs, viewportMs, nextNow),
      );
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, [followLive, msPerPixel, startedAtMs, waveformWidth]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-8, 8])
        .onBegin(() => {
          panOrigin.current = { viewStartMs, msPerPixel };
        })
        .onUpdate((event) => {
          if (waveformWidth <= 0) {
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
          setFollowLive(viewEnd >= nowMs - LIVE_EDGE_MS);
        }),
    [durationMs, msPerPixel, nowMs, viewStartMs, waveformWidth],
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

  const composed = useMemo(
    () => Gesture.Simultaneous(pan, pinch),
    [pan, pinch],
  );

  const playheadX =
    waveformWidth > 0 ? (nowMs - viewStartMs) / msPerPixel : -1;
  const showPlayhead = playheadX >= 0 && playheadX <= waveformWidth;
  const tracksHeight = Math.min(
    Math.max(tracks.length, 1) * TRACK_HEIGHT,
    MAX_TRACKS_VISIBLE * TRACK_HEIGHT,
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {header}
        <Pressable
          style={[styles.liveButton, followLive && styles.liveButtonActive]}
          onPress={() => setFollowLive(true)}
        >
          <Text
            style={[
              styles.liveButtonText,
              followLive && styles.liveButtonTextActive,
            ]}
          >
            Live
          </Text>
        </Pressable>
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
                />
              ))
            )}
          </ScrollView>
          {showPlayhead ? (
            <View pointerEvents="none" style={styles.playheadLayer}>
              <Svg width={width} height={RULER_HEIGHT + tracksHeight}>
                <Line
                  x1={LABEL_WIDTH + playheadX}
                  y1={0}
                  x2={LABEL_WIDTH + playheadX}
                  y2={RULER_HEIGHT + tracksHeight}
                  stroke="#facc15"
                  strokeWidth={1.5}
                />
              </Svg>
            </View>
          ) : null}
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
    paddingBottom: 8,
    gap: 8,
  },
  liveButton: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
