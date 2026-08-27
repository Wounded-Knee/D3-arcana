import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnnotationInspect } from '@/components/timeline/annotation-inspect';
import { CallTimeline } from '@/components/timeline/call-timeline';
import { usePreferences } from '@/context/preferences';
import type {
  TimelineAnnotation,
  TimelineAnnotationProfile,
  TimelineChunk,
  TimelineSelection,
  TimelineTrack,
} from '@/components/timeline/timeline-model';
import { emptyRatification } from '@/components/timeline/timeline-model';
import {
  WAVEFORM_CHUNK_DURATION_MS,
  WAVEFORM_SAMPLE_INTERVAL_MS,
} from '@/lib/call/waveform-sampler';

const SIMULATED_DURATION_MS = 60_000;
const SAMPLES_PER_CHUNK = WAVEFORM_CHUNK_DURATION_MS / WAVEFORM_SAMPLE_INTERVAL_MS;
const CHUNK_COUNT = Math.ceil(SIMULATED_DURATION_MS / WAVEFORM_CHUNK_DURATION_MS);

const TEST_PROFILES: TimelineAnnotationProfile[] = [
  { id: 'p-decision', key: 'decision', name: 'Decision', color: '#f59e0b', icon: 'gavel' },
  { id: 'p-action', key: 'action', name: 'Action', color: '#38bdf8', icon: 'flag' },
  { id: 'p-question', key: 'question', name: 'Question', color: '#c084fc', icon: 'help-outline' },
  { id: 'p-agreement', key: 'agreement', name: 'Agreement', color: '#4ade80', icon: 'check-circle' },
  { id: 'p-concern', key: 'concern', name: 'Concern', color: '#fb7185', icon: 'warning' },
  { id: 'p-highlight', key: 'highlight', name: 'Highlight', color: '#facc15', icon: 'star' },
];

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
  const { timelineOrientation } = usePreferences();
  const vertical = timelineOrientation === 'vertical';
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

  const [annotations, setAnnotations] = useState<TimelineAnnotation[]>(() => [
    {
      id: 'ann-decision',
      profile: TEST_PROFILES[0]!,
      note: null,
      startMs: 4_000,
      endMs: 10_000,
      scope: { kind: 'all' },
      selectionId: null,
      createdBy: { id: 'local', displayName: 'You' },
      ratification: emptyRatification(1),
    },
    {
      id: 'ann-question',
      profile: TEST_PROFILES[2]!,
      note: null,
      startMs: 18_000,
      endMs: 18_000,
      scope: { kind: 'channel', userId: 'sim-1' },
      selectionId: null,
      createdBy: { id: 'local', displayName: 'You' },
      ratification: emptyRatification(1),
    },
    {
      id: 'ann-concern',
      profile: TEST_PROFILES[4]!,
      note: null,
      startMs: 32_000,
      endMs: 42_000,
      scope: { kind: 'all' },
      selectionId: null,
      createdBy: { id: 'local', displayName: 'You' },
      ratification: emptyRatification(1),
    },
  ]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(
    null,
  );

  const selectedAnnotation = annotations.find(
    (item) => item.id === selectedAnnotationId,
  );

  const inspectPanel = selectedAnnotation ? (
    <AnnotationInspect
      annotation={selectedAnnotation}
      channelLabel={
        selectedAnnotation.scope.kind === 'channel'
          ? tracks.find(
              (track) =>
                selectedAnnotation.scope.kind === 'channel' &&
                track.userId === selectedAnnotation.scope.userId,
            )?.displayName ?? 'One channel'
          : 'All channels'
      }
      canEdit
      canRatify={false}
      onRatify={() => undefined}
      onChangeNote={(note) => {
        setAnnotations((current) =>
          current.map((item) =>
            item.id === selectedAnnotation.id ? { ...item, note } : item,
          ),
        );
      }}
      onDismiss={() => setSelectedAnnotationId(null)}
      onDelete={() => {
        setAnnotations((current) =>
          current.filter((item) => item.id !== selectedAnnotation.id),
        );
        setSelectedAnnotationId(null);
      }}
    />
  ) : null;

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
        orientation={timelineOrientation}
        header={header}
        inspect={vertical ? inspectPanel : null}
        profiles={TEST_PROFILES}
        annotations={annotations}
        selectedAnnotationId={selectedAnnotationId}
        onSelectAnnotation={setSelectedAnnotationId}
        onCreateAnnotation={(input) => {
          const profile = TEST_PROFILES.find((item) => item.id === input.profileId);
          if (!profile) {
            return;
          }
          const id = `ann-${Date.now()}`;
          const next: TimelineAnnotation = {
            id,
            profile,
            note: null,
            startMs: input.startMs,
            endMs: input.endMs,
            scope: input.userId
              ? { kind: 'channel', userId: input.userId }
              : { kind: 'all' },
            selectionId: input.selection?.id ?? null,
            createdBy: { id: 'local', displayName: 'You' },
            ratification: emptyRatification(1),
          };
          setAnnotations((current) => [...current, next]);
          setSelectedAnnotationId(id);
        }}
        onAttachSelection={(selection: TimelineSelection) => {
          if (!selectedAnnotationId) {
            return;
          }
          setAnnotations((current) =>
            current.map((item) =>
              item.id === selectedAnnotationId
                ? {
                    ...item,
                    startMs: selection.startMs,
                    endMs: selection.endMs,
                    scope: selection.scope,
                    selectionId: selection.id ?? item.selectionId,
                  }
                : item,
            ),
          );
        }}
      />
      {!vertical ? inspectPanel : null}
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
