import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TimelineOrientation } from '@/components/timeline/timeline-layout';
import { useAuth } from '@/context/auth';
import { usePreferences } from '@/context/preferences';

const ORIENTATION_OPTIONS: { value: TimelineOrientation; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { timelineOrientation, setTimelineOrientation } = usePreferences();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        {user ? (
          <Text style={styles.subtitle}>Signed in as {user.displayName}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Timeline orientation</Text>
        <View style={styles.segment}>
          {ORIENTATION_OPTIONS.map((option) => {
            const selected = timelineOrientation === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.segmentOption, selected && styles.segmentSelected]}
                onPress={() => setTimelineOrientation(option.value)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentOption: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  segmentSelected: {
    backgroundColor: '#334155',
  },
  segmentText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: '#f8fafc',
  },
  signOut: {
    marginHorizontal: 20,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
  },
  signOutText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
});
