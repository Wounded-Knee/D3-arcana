import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { formatTick } from './timeline-math';
import type { TimelineAnnotation } from './timeline-model';

type AnnotationInspectProps = {
  annotation: TimelineAnnotation;
  channelLabel: string;
  canEdit: boolean;
  canRatify: boolean;
  onChangeNote: (note: string) => void;
  onRatify: (stance: 'for' | 'against' | null) => void;
  onDismiss: () => void;
  onDelete?: () => void;
};

export function AnnotationInspect({
  annotation,
  channelLabel,
  canEdit,
  canRatify,
  onChangeNote,
  onRatify,
  onDismiss,
  onDelete,
}: AnnotationInspectProps) {
  const [draft, setDraft] = useState(annotation.note ?? '');

  useEffect(() => {
    setDraft(annotation.note ?? '');
  }, [annotation.id, annotation.note]);

  const durationMs = Math.max(0, annotation.endMs - annotation.startMs);
  const { myStance, tallies, outcome } = annotation.ratification;

  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <MaterialIcons
          name={annotation.profile.icon as keyof typeof MaterialIcons.glyphMap}
          size={18}
          color={annotation.profile.color}
        />
        <Text style={[styles.title, { color: annotation.profile.color }]}>
          {annotation.profile.name}
        </Text>
        <Pressable style={styles.close} onPress={onDismiss}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>
        {annotation.createdBy.displayName}
        {' · '}
        {formatTick(annotation.startMs)}
        {durationMs > 0 ? `–${formatTick(annotation.endMs)}` : ''}
        {' · '}
        {durationMs === 0 ? '0:00' : formatTick(durationMs)}
        {' · '}
        {channelLabel}
      </Text>
      {outcome.status !== 'open' ? (
        <Text
          style={[
            styles.outcome,
            outcome.status === 'rejected' && styles.outcomeRejected,
          ]}
        >
          {outcome.status === 'ratified' ? 'Ratified' : 'Rejected'}
          {' · '}
          {outcome.snapshot.totalUserCount} members
          {' · '}
          {outcome.snapshot.for} for
          {' · '}
          {outcome.snapshot.against} against
        </Text>
      ) : null}
      <View style={styles.voteRow}>
        <Pressable
          style={[
            styles.voteButton,
            myStance === 'for' && styles.voteButtonActive,
          ]}
          disabled={!canRatify}
          onPress={() => onRatify(myStance === 'for' ? null : 'for')}
        >
          <MaterialIcons
            name="thumb-up"
            size={16}
            color={myStance === 'for' ? '#86efac' : '#94a3b8'}
          />
          <Text
            style={[
              styles.voteCount,
              myStance === 'for' && styles.voteCountActive,
            ]}
          >
            {tallies.for}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.voteButton,
            myStance === 'against' && styles.voteButtonActive,
          ]}
          disabled={!canRatify}
          onPress={() => onRatify(myStance === 'against' ? null : 'against')}
        >
          <MaterialIcons
            name="thumb-down"
            size={16}
            color={myStance === 'against' ? '#fb7185' : '#94a3b8'}
          />
          <Text
            style={[
              styles.voteCount,
              myStance === 'against' && styles.voteCountActive,
            ]}
          >
            {tallies.against}
          </Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.note}
        value={draft}
        editable={canEdit}
        placeholder={canEdit ? 'Add a note (optional)' : 'No note'}
        placeholderTextColor="#64748b"
        multiline
        onChangeText={setDraft}
        onBlur={() => {
          if (canEdit && draft !== (annotation.note ?? '')) {
            onChangeNote(draft);
          }
        }}
      />
      {canEdit && onDelete ? (
        <Pressable style={styles.delete} onPress={onDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#166534',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  close: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeText: {
    color: '#86efac',
    fontWeight: '600',
    fontSize: 13,
  },
  meta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  outcome: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '600',
  },
  outcomeRejected: {
    color: '#fb7185',
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  voteButtonActive: {
    borderColor: '#166534',
    backgroundColor: '#052e16',
  },
  voteCount: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  voteCountActive: {
    color: '#e2e8f0',
  },
  note: {
    minHeight: 40,
    color: '#e2e8f0',
    fontSize: 14,
    padding: 0,
  },
  delete: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  deleteText: {
    color: '#fb7185',
    fontWeight: '600',
    fontSize: 13,
  },
});
