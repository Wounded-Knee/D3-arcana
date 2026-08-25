import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        {user ? (
          <Text style={styles.subtitle}>Signed in as {user.displayName}</Text>
        ) : null}
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
