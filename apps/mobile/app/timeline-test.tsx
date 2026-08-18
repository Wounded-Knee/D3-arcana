import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CallTimeline } from '@/components/timeline/call-timeline';
import type { TimelineChunk, TimelineTrack } from '@/components/timeline/timeline-model';
import {
  WAVEFORM_CHUNK_DURATION_MS,
  WAVEFORM_SAMPLE_INTERVAL_MS,
} from '@/lib/call/waveform-sampler';

const SIMULATED_DURATION_MS = 60_000;
const SAMPLES_PER_CHUNK = WAVEFORM_CHUNK_DURATION_MS / WAVEFORM_SAMPLE_INTERVAL_MS;
const CHUNK_COUNT = Math.ceil(SIMULATED_DURATION_MS / WAVEFORM_CHUNK_DURATION_MS);

function createCallWindow() {
  const startedAtMs = Date.now();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(startedAtMs + SIMULATED_DURATION_MS).toISOString(),
  };
}

function createSimulatedTrack(
  index: number,
  startedAt: string,
  endedAt: string,
): TimelineTrack {
  const phase = index * 0.7;
  const chunks: TimelineChunk[] = [];

  for (let chunkIndex = 0; chunkIndex < CHUNK_COUNT; chunkIndex += 1) {
    const amplitudes: number[] = [];
    for (let sample = 0; sample < SAMPLES_PER_CHUNK; sample += 1) {
      const t = (chunkIndex * SAMPLES_PER_CHUNK + sample) * 0.05;
      const wave =
        0.5 + 0.45 * Math.sin(t * 2.2 + phase) * Math.sin(t * 0.4 + phase);
      amplitudes.push(Math.max(0, Math.min(255, Math.round(wave * 255))));
    }
    chunks.push({
      startOffsetMs: chunkIndex * WAVEFORM_CHUNK_DURATION_MS,
      amplitudes,
    });
  }

  return {
    userId: `sim-${index}`,
    displayName: `Track ${index}`,
    sessions: [{ joinedAt: startedAt, leftAt: endedAt }],
    chunks,
  };
}

function nextTrackIndex(tracks: TimelineTrack[]): number {
  return (
    tracks.reduce((max, track) => {
      const value = Number(track.userId.replace('sim-', ''));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1
  );
}

export default function TimelineTestScreen() {
  const [{ startedAt, endedAt }] = useState(createCallWindow);
  const [tracks, setTracks] = useState(() => [
    createSimulatedTrack(1, startedAt, endedAt),
    createSimulatedTrack(2, startedAt, endedAt),
  ]);

  const handleAddTrack = useCallback(() => {
    setTracks((current) => [
      ...current,
      createSimulatedTrack(nextTrackIndex(current), startedAt, endedAt),
    ]);
  }, [endedAt, startedAt]);

  const handleRemoveTrack = useCallback(() => {
    setTracks((current) => current.slice(0, -1));
  }, []);

  const header = (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>Simulated call</Text>
        <Text style={styles.meta}>
          {tracks.length} track{tracks.length === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={handleAddTrack}>
          <Text style={styles.buttonText}>+Track</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.removeButton, tracks.length === 0 && styles.disabled]}
          disabled={tracks.length === 0}
          onPress={handleRemoveTrack}>
          <Text style={styles.buttonText}>-Track</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <CallTimeline
        startedAt={startedAt}
        endedAt={endedAt}
        tracks={tracks}
        live={false}
        header={header}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: '#dcfce7',
    fontWeight: '700',
    fontSize: 16,
  },
  meta: {
    color: '#bbf7d0',
    marginTop: 2,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeButton: {
    backgroundColor: '#dc2626',
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
