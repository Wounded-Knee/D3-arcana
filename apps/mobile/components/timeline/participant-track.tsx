import { StyleSheet, Text, View } from 'react-native';

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
};

export function ParticipantTrack({
  track,
  width,
  viewStartMs,
  msPerPixel,
  callStartedAtMs,
}: ParticipantTrackProps) {
  const waveformWidth = Math.max(0, width - LABEL_WIDTH);

  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={styles.labelText} numberOfLines={1}>
          {track.displayName}
        </Text>
      </View>
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
  labelText: {
    color: '#dcfce7',
    fontSize: 12,
    fontWeight: '600',
  },
  waveform: {
    backgroundColor: '#052e16',
    overflow: 'hidden',
  },
});
