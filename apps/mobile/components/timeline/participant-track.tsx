import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { LABEL_WIDTH } from './timeline-math';
import type { TimelineTrack } from './timeline-model';
import { WaveformBars } from './waveform-bars';

export const TRACK_HEIGHT = 48;

type ParticipantTrackProps = {
  track: TimelineTrack;
  width: number;
  viewStartMs: number;
  msPerPixel: number;
  callStartedAtMs: number;
  overscanPx: number;
  shiftStyle: AnimatedStyle<ViewStyle>;
  solo?: boolean;
  onPressLabel?: (userId: string) => void;
};

export const ParticipantTrack = memo(function ParticipantTrack({
  track,
  width,
  viewStartMs,
  msPerPixel,
  callStartedAtMs,
  overscanPx,
  shiftStyle,
  solo = false,
  onPressLabel,
}: ParticipantTrackProps) {
  const waveformWidth = Math.max(0, width - LABEL_WIDTH);
  const drawWidth = waveformWidth + overscanPx * 2;
  const drawStartMs = viewStartMs - overscanPx * msPerPixel;

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.label, solo && styles.labelSolo]}
        onPress={() => onPressLabel?.(track.userId)}
      >
        <Text style={[styles.labelText, solo && styles.labelTextSolo]} numberOfLines={1}>
          {track.displayName}
        </Text>
      </Pressable>
      <View style={[styles.waveform, { width: waveformWidth }]}>
        <Animated.View
          style={[
            { width: drawWidth, marginLeft: -overscanPx },
            shiftStyle,
          ]}
        >
          <WaveformBars
            width={drawWidth}
            height={TRACK_HEIGHT}
            viewStartMs={drawStartMs}
            msPerPixel={msPerPixel}
            callStartedAtMs={callStartedAtMs}
            sessions={track.sessions}
            chunks={track.chunks}
          />
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: TRACK_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#166534',
  },
  label: {
    width: LABEL_WIDTH,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: '#14532d',
  },
  labelSolo: {
    backgroundColor: '#22c55e',
  },
  labelText: {
    color: '#dcfce7',
    fontSize: 12,
    fontWeight: '600',
  },
  labelTextSolo: {
    color: '#052e16',
  },
  waveform: {
    backgroundColor: '#052e16',
    overflow: 'hidden',
  },
});
