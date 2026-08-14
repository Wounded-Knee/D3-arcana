import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/context/auth';

export default function Index() {
  const { user } = useAuth();

  return <Redirect href={(user ? '/(tabs)' : '/login') as Href} />;
}
