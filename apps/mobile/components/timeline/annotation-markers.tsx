import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { LABEL_WIDTH, OVERSCAN_PX } from './timeline-math';
import {
  LABEL_HEIGHT,
  RULER_GUTTER,
  RULER_HEIGHT,
  TRACK_HEIGHT,
  TRACK_WIDTH,
  type TimelineOrientation,
} from './timeline-layout';
import type { TimelineAnnotation, TimelineTrack } from './timeline-model';

const CHIP_MIN_WIDTH = 52;
const POINT_PAD_MS_FALLBACK = 400;

type AnnotationMarkersProps = {
  annotations: TimelineAnnotation[];
  selectedId: string | null;
  orientation?: TimelineOrientation;
  paneSize: number;
  viewStartMs: number;
  msPerPixel: number;
  tracks: TimelineTrack[];
  tracksCrossPx: number;
  shiftStyle: AnimatedStyle<ViewStyle>;
  onSelect: (id: string) => void;
};

function trackOffset(
  tracks: TimelineTrack[],
  userId: string,
  orientation: TimelineOrientation,
): number | null {
  const index = tracks.findIndex((track) => track.userId === userId);
  if (index < 0) {
    return null;
  }
  if (orientation === 'vertical') {
    return RULER_GUTTER + index * TRACK_WIDTH;
  }
  return RULER_HEIGHT + index * TRACK_HEIGHT;
}

export function AnnotationMarkers({
  annotations,
  selectedId,
  orientation = 'horizontal',
  paneSize,
  viewStartMs,
  msPerPixel,
  tracks,
  tracksCrossPx,
  shiftStyle,
  onSelect,
}: AnnotationMarkersProps) {
  if (paneSize <= 0) {
    return null;
  }

  const vertical = orientation === 'vertical';
  const clipStyle = vertical
    ? { top: LABEL_HEIGHT, height: paneSize, left: 0, right: 0 }
    : { left: LABEL_WIDTH, width: paneSize, top: 0, bottom: 0 };

  return (
    <View pointerEvents="box-none" style={[styles.clip, clipStyle]}>
      <Animated.View pointerEvents="box-none" style={[styles.layer, shiftStyle]}>
      {annotations.map((annotation) => {
        const isPoint = annotation.endMs <= annotation.startMs;
        const labelAlongPx = vertical
          ? 20
          : Math.max(
              CHIP_MIN_WIDTH,
              annotation.profile.name.length * 7 + 16,
            );
        const rangePx = isPoint
          ? Math.max(labelAlongPx, POINT_PAD_MS_FALLBACK / msPerPixel)
          : (annotation.endMs - annotation.startMs) / msPerPixel;
        const startPx = isPoint
          ? (annotation.startMs - viewStartMs) / msPerPixel - rangePx / 2
          : (annotation.startMs - viewStartMs) / msPerPixel;
        const selected = selectedId === annotation.id;
        const crossStart =
          annotation.scope.kind === 'channel'
            ? (trackOffset(tracks, annotation.scope.userId, orientation) ?? 0)
            : 0;
        const crossSize =
          annotation.scope.kind === 'channel'
            ? vertical
              ? TRACK_WIDTH
              : TRACK_HEIGHT
            : vertical
              ? RULER_GUTTER + tracksCrossPx
              : RULER_HEIGHT + tracksCrossPx;
        const alongSize = Math.max(rangePx, labelAlongPx);
        const allChannelCross = vertical ? RULER_GUTTER : RULER_HEIGHT;

        if (startPx + alongSize < -OVERSCAN_PX || startPx > paneSize + OVERSCAN_PX) {
          return null;
        }

        return (
          <Pressable
            key={annotation.id}
            onPress={() => onSelect(annotation.id)}
            style={[
              styles.box,
              {
                ...(vertical
                  ? {
                      top: startPx,
                      height: alongSize,
                      left: crossStart,
                      width: annotation.scope.kind === 'all' ? allChannelCross : crossSize,
                    }
                  : {
                      left: startPx,
                      width: alongSize,
                      top: crossStart,
                      height: annotation.scope.kind === 'all' ? allChannelCross : crossSize,
                    }),
                backgroundColor: selected
                  ? `${annotation.profile.color}55`
                  : `${annotation.profile.color}33`,
                borderColor: selected
                  ? annotation.profile.color
                  : `${annotation.profile.color}aa`,
                borderWidth: selected ? 2 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, { color: annotation.profile.color }]}
            >
              {annotation.profile.name}
            </Text>
          </Pressable>
        );
      })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    position: 'absolute',
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  box: {
    position: 'absolute',
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
