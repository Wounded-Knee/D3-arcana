import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DevUserSwitcher } from '@/components/dev-user-switcher';
import { isDevUserSwitcherEnabled } from '@/lib/dev/user-switcher';

const NESTED_PREFIXES = ['/conversation', '/notifications', '/settings'];

function isNestedRoute(pathname: string): boolean {
  return NESTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function IconButton({
  name,
  label,
  onPress,
}: {
  name: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}>
      <MaterialIcons name={name} size={24} color="#e2e8f0" />
    </Pressable>
  );
}

export function AppTopBar() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const showBack = isNestedRoute(pathname);

  function open(href: '/notifications' | '/settings') {
    if (pathname === href) {
      return;
    }
    router.push(href as Href);
  }

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {showBack ? (
            <IconButton
              name="chevron-left"
              label="Go back"
              onPress={() => router.back()}
            />
          ) : null}
        </View>
        <View style={styles.actions}>
          {isDevUserSwitcherEnabled() ? <DevUserSwitcher /> : null}
          <IconButton
            name="notifications"
            label="Notifications"
            onPress={() => open('/notifications')}
          />
          <IconButton
            name="settings"
            label="Settings"
            onPress={() => open('/settings')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#0f172a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b',
    zIndex: 20,
    elevation: 8,
    overflow: 'visible',
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'visible',
    zIndex: 20,
  },
  side: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 20,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: {
    opacity: 0.6,
  },
});
