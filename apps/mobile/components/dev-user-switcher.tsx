import { DEV_SEED_USERS } from '@d3-arcana/dev-auth';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { leaveCall } from '@/lib/api';
import {
  conversationIdFromPath,
  isDevInCall,
  setPendingDevRestore,
} from '@/lib/dev/user-switcher';

export function DevUserSwitcher() {
  const { user, token, isLoading, switchUser } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function handleSelect(nextToken: string) {
    if (!token || nextToken === token || isLoading) {
      setOpen(false);
      return;
    }

    setOpen(false);

    const joinCall = isDevInCall();
    if (joinCall) {
      const conversationId = conversationIdFromPath(pathname);
      if (conversationId) {
        try {
          await leaveCall(token, conversationId);
        } catch {
          // Still switch — LiveKit drops on unmount.
        }
      }
    }

    setPendingDevRestore({ joinCall });

    try {
      await switchUser(nextToken);
    } catch {
      setPendingDevRestore(null);
    }
  }

  const label = user?.displayName ?? 'User';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          if (!isLoading) {
            setOpen((current) => !current);
          }
        }}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={`Switch user, currently ${label}`}
        hitSlop={4}
        style={({ pressed }) => [
          styles.chip,
          pressed && styles.chipPressed,
          isLoading && styles.chipDisabled,
        ]}>
        <Text style={styles.chipText} numberOfLines={1}>
          {isLoading ? '…' : label}
        </Text>
        <MaterialIcons name="expand-more" size={16} color="#e2e8f0" />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {DEV_SEED_USERS.map((seedUser) => {
            const selected = seedUser.token === token;
            return (
              <Pressable
                key={seedUser.key}
                disabled={selected || isLoading}
                onPress={() => {
                  void handleSelect(seedUser.token);
                }}
                style={({ pressed }) => [
                  styles.item,
                  selected && styles.itemSelected,
                  pressed && !selected && styles.itemPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${seedUser.displayName}`}
                accessibilityState={{ selected, disabled: selected }}>
                <Text
                  style={[
                    styles.itemText,
                    selected && styles.itemTextSelected,
                  ]}>
                  {seedUser.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 30,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 72,
  },
  menu: {
    position: 'absolute',
    top: 44,
    right: 0,
    minWidth: 128,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 4,
    zIndex: 40,
    elevation: 12,
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemSelected: {
    backgroundColor: '#334155',
  },
  itemPressed: {
    backgroundColor: '#0f172a',
  },
  itemText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  itemTextSelected: {
    color: '#94a3b8',
  },
});
