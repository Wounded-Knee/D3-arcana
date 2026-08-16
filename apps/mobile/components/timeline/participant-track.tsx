import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TimelineTrack } from './timeline-model';
import { WaveformBars } from './waveform-bars';

const LABEL_WIDTH = 88;
export const TRACK_HEIGHT = 48;

type ParticipantTrackProps = {
  track: TimelineTrack;
  width: number;
  viewStartMs: number;
  msPerPixel: number;
  callStartedAtMs: number;
  solo?: boolean;
  onPressLabel?: () => void;
};

export function ParticipantTrack({
  track,
  width,
  viewStartMs,
  msPerPixel,
  callStartedAtMs,
  solo = false,
  onPressLabel,
}: ParticipantTrackProps) {
  const waveformWidth = Math.max(0, width - LABEL_WIDTH);

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.label, solo && styles.labelSolo]}
        onPress={onPressLabel}
      >
        <Text style={[styles.labelText, solo && styles.labelTextSolo]} numberOfLines={1}>
          {track.displayName}
        </Text>
      </Pressable>
      <View style={[styles.waveform, { width: waveformWidth }]}>
        <WaveformBars
          width={waveformWidth}
          height={TRACK_HEIGHT}
          viewStartMs={viewStartMs}
          msPerPixel={msPerPixel}
          callStartedAtMs={callStartedAtMs}
          sessions={track.sessions}
          chunks={track.chunks}
        />
      </View>
    </View>
  );
}

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
