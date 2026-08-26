import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Rect, Svg } from 'react-native-svg';

import {
  TIMELINE_ACCENT,
  TIMELINE_BG_DARK,
  TIMELINE_BORDER,
  TIMELINE_LIVE_EDGE,
  TIMELINE_PLAYHEAD,
} from './timeline-colors';
import { MINIMAP_THICKNESS, type TimelineOrientation } from './timeline-layout';
import { minimapPxForTime } from './timeline-math';
import type { TimelineAnnotation } from './timeline-model';

const POINT_MIN_PX = 3;
const THUMB_MIN_PX = 8;
const ANNOTATION_OPACITY = 0.75;

type TimelineMinimapProps = {
  orientation?: TimelineOrientation;
  lengthPx: number;
  durationMs: number;
  annotations: TimelineAnnotation[];
  showLiveEdge: boolean;
  viewStartSv: SharedValue<number>;
  msPerPixelSv: SharedValue<number>;
  durationSv: SharedValue<number>;
  paneSizeSv: SharedValue<number>;
  playheadSv: SharedValue<number>;
  nowSv: SharedValue<number>;
};

function annotationAlong(
  annotation: TimelineAnnotation,
  durationMs: number,
  lengthPx: number,
): { startPx: number; sizePx: number } {
  const isPoint = annotation.endMs <= annotation.startMs;
  const startPx = minimapPxForTime(annotation.startMs, durationMs, lengthPx);
  if (isPoint) {
    return {
      startPx: startPx - POINT_MIN_PX / 2,
      sizePx: POINT_MIN_PX,
    };
  }
  const endPx = minimapPxForTime(annotation.endMs, durationMs, lengthPx);
  return {
    startPx,
    sizePx: Math.max(POINT_MIN_PX, endPx - startPx),
  };
}

export function TimelineMinimap({
  orientation = 'horizontal',
  lengthPx,
  durationMs,
  annotations,
  showLiveEdge,
  viewStartSv,
  msPerPixelSv,
  durationSv,
  paneSizeSv,
  playheadSv,
  nowSv,
}: TimelineMinimapProps) {
  const vertical = orientation === 'vertical';
  const width = vertical ? MINIMAP_THICKNESS : lengthPx;
  const height = vertical ? lengthPx : MINIMAP_THICKNESS;

  const thumbStyle = useAnimatedStyle(() => {
    const duration = durationSv.value || 1;
    const length = paneSizeSv.value;
    const perPx = msPerPixelSv.value || 1;
    const viewportMs = length * perPx;
    const start = minimapPxForTime(viewStartSv.value, duration, length);
    const rawSize = minimapPxForTime(viewportMs, duration, length);
    const size = Math.max(THUMB_MIN_PX, rawSize);
    const along = Math.min(Math.max(0, start), Math.max(0, length - size));
    if (vertical) {
      return {
        top: along,
        height: size,
        left: 0,
        right: 0,
      };
    }
    return {
      left: along,
      width: size,
      top: 0,
      bottom: 0,
    };
  });

  const playheadStyle = useAnimatedStyle(() => {
    const duration = durationSv.value || 1;
    const length = paneSizeSv.value;
    const timeMs = playheadSv.value;
    const visible = timeMs >= 0 && timeMs <= duration;
    const along = minimapPxForTime(timeMs, duration, length);
    return {
      opacity: visible ? 1 : 0,
      transform: vertical
        ? [{ translateY: along }]
        : [{ translateX: along }],
    };
  });

  const liveEdgeStyle = useAnimatedStyle(() => {
    const duration = durationSv.value || 1;
    const length = paneSizeSv.value;
    const timeMs = nowSv.value;
    const visible = timeMs >= 0 && timeMs <= duration;
    const along = minimapPxForTime(timeMs, duration, length);
    return {
      opacity: visible ? 1 : 0,
      transform: vertical
        ? [{ translateY: along }]
        : [{ translateX: along }],
    };
  });

  if (lengthPx <= 0) {
    return null;
  }

  return (
    <View style={[styles.track, { width, height }]}>
      <Svg width={width} height={height}>
        {annotations.map((annotation) => {
          const { startPx, sizePx } = annotationAlong(
            annotation,
            durationMs,
            lengthPx,
          );
          return (
            <Rect
              key={annotation.id}
              x={vertical ? 1 : startPx}
              y={vertical ? startPx : 1}
              width={vertical ? MINIMAP_THICKNESS - 2 : sizePx}
              height={vertical ? sizePx : MINIMAP_THICKNESS - 2}
              fill={annotation.profile.color}
              opacity={ANNOTATION_OPACITY}
            />
          );
        })}
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[styles.thumb, thumbStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          vertical ? styles.tickVertical : styles.tick,
          { backgroundColor: TIMELINE_PLAYHEAD },
          playheadStyle,
        ]}
      />
      {showLiveEdge ? (
        <Animated.View
          pointerEvents="none"
          style={[
            vertical ? styles.tickVertical : styles.tick,
            { backgroundColor: TIMELINE_LIVE_EDGE },
            liveEdgeStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: TIMELINE_BG_DARK,
    overflow: 'hidden',
    borderColor: TIMELINE_BORDER,
    borderWidth: 1,
  },
  thumb: {
    position: 'absolute',
    backgroundColor: `${TIMELINE_ACCENT}33`,
    borderColor: TIMELINE_ACCENT,
    borderWidth: 1,
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
  },
  tickVertical: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    marginTop: -1,
  },
});
