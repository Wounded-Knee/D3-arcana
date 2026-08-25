import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { LABEL_WIDTH, OVERSCAN_PX } from './timeline-math';
import { TRACK_HEIGHT } from './participant-track';
import type { TimelineAnnotation, TimelineTrack } from './timeline-model';

const RULER_HEIGHT = 22;
const CHIP_MIN_WIDTH = 52;
const POINT_PAD_MS_FALLBACK = 400;

type AnnotationMarkersProps = {
  annotations: TimelineAnnotation[];
  selectedId: string | null;
  width: number;
  viewStartMs: number;
  msPerPixel: number;
  tracks: TimelineTrack[];
  tracksHeight: number;
  shiftStyle: AnimatedStyle<ViewStyle>;
  onSelect: (id: string) => void;
};

function trackTop(tracks: TimelineTrack[], userId: string): number | null {
  const index = tracks.findIndex((track) => track.userId === userId);
  if (index < 0) {
    return null;
  }
  return RULER_HEIGHT + index * TRACK_HEIGHT;
}

export function AnnotationMarkers({
  annotations,
  selectedId,
  width,
  viewStartMs,
  msPerPixel,
  tracks,
  tracksHeight,
  shiftStyle,
  onSelect,
}: AnnotationMarkersProps) {
  const waveformWidth = Math.max(0, width - LABEL_WIDTH);
  if (waveformWidth <= 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.clip, { left: LABEL_WIDTH, width: waveformWidth }]}>
      <Animated.View pointerEvents="box-none" style={[styles.layer, shiftStyle]}>
      {annotations.map((annotation) => {
        const isPoint = annotation.endMs <= annotation.startMs;
        const labelWidth = Math.max(
          CHIP_MIN_WIDTH,
          annotation.profile.name.length * 7 + 16,
        );
        const rangeWidth = isPoint
          ? Math.max(labelWidth, POINT_PAD_MS_FALLBACK / msPerPixel)
          : (annotation.endMs - annotation.startMs) / msPerPixel;
        const startX = isPoint
          ? (annotation.startMs - viewStartMs) / msPerPixel - rangeWidth / 2
          : (annotation.startMs - viewStartMs) / msPerPixel;
        const left = startX;
        const selected = selectedId === annotation.id;

        const top =
          annotation.scope.kind === 'channel'
            ? (trackTop(tracks, annotation.scope.userId) ?? 0)
            : 0;
        const height =
          annotation.scope.kind === 'channel'
            ? TRACK_HEIGHT
            : RULER_HEIGHT + tracksHeight;
        const boxWidth = Math.max(rangeWidth, labelWidth);

        if (left + boxWidth < -OVERSCAN_PX || left > waveformWidth + OVERSCAN_PX) {
          return null;
        }

        return (
          <Pressable
            key={annotation.id}
            onPress={() => onSelect(annotation.id)}
            style={[
              styles.box,
              {
                left,
                top,
                width: boxWidth,
                height: annotation.scope.kind === 'all' ? RULER_HEIGHT : height,
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
    top: 0,
    bottom: 0,
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
