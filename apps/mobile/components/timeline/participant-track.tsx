import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { LABEL_WIDTH } from './timeline-math';
import {
  LABEL_HEIGHT,
  TRACK_HEIGHT,
  TRACK_WIDTH,
  type TimelineOrientation,
} from './timeline-layout';
import type { TimelineTrack } from './timeline-model';
import { WaveformBars } from './waveform-bars';

export { TRACK_HEIGHT, TRACK_WIDTH };

type ParticipantTrackProps = {
  track: TimelineTrack;
  orientation?: TimelineOrientation;
  paneSize: number;
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
  orientation = 'horizontal',
  paneSize,
  viewStartMs,
  msPerPixel,
  callStartedAtMs,
  overscanPx,
  shiftStyle,
  solo = false,
  onPressLabel,
}: ParticipantTrackProps) {
  const vertical = orientation === 'vertical';
  const drawLength = paneSize + overscanPx * 2;
  const drawStartMs = viewStartMs - overscanPx * msPerPixel;
  const label = (
    <Pressable
      style={[
        vertical ? styles.labelVertical : styles.label,
        solo && styles.labelSolo,
      ]}
      onPress={() => onPressLabel?.(track.userId)}
    >
      <Text style={[styles.labelText, solo && styles.labelTextSolo]} numberOfLines={1}>
        {track.displayName}
      </Text>
    </Pressable>
  );

  if (vertical) {
    return (
      <View style={[styles.column, { height: LABEL_HEIGHT + paneSize }]}>
        {label}
        <View style={[styles.waveform, { width: TRACK_WIDTH, height: paneSize }]}>
          <Animated.View
            style={[
              { height: drawLength, marginTop: -overscanPx },
              shiftStyle,
            ]}
          >
            <WaveformBars
              width={TRACK_WIDTH}
              height={drawLength}
              viewStartMs={drawStartMs}
              msPerPixel={msPerPixel}
              callStartedAtMs={callStartedAtMs}
              sessions={track.sessions}
              chunks={track.chunks}
              orientation="vertical"
            />
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {label}
      <View style={[styles.waveform, { width: paneSize }]}>
        <Animated.View
          style={[
            { width: drawLength, marginLeft: -overscanPx },
            shiftStyle,
          ]}
        >
          <WaveformBars
            width={drawLength}
            height={TRACK_HEIGHT}
            viewStartMs={drawStartMs}
            msPerPixel={msPerPixel}
            callStartedAtMs={callStartedAtMs}
            sessions={track.sessions}
            chunks={track.chunks}
            orientation="horizontal"
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
  column: {
    width: TRACK_WIDTH,
    overflow: 'hidden',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#166534',
  },
  label: {
    width: LABEL_WIDTH,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: '#14532d',
  },
  labelVertical: {
    height: LABEL_HEIGHT,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
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
