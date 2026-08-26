import { Redirect, Stack, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppTopBar } from '@/components/app-top-bar';
import { useAuth } from '@/context/auth';

export default function AppLayout() {
  const { user, token } = useAuth();

  if (!user || !token) {
    return <Redirect href={'/login' as Href} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <AppTopBar />
      </View>
      <Stack key={user.id} screenOptions={{ headerShown: false }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  topBar: {
    zIndex: 20,
    elevation: 8,
  },
});
