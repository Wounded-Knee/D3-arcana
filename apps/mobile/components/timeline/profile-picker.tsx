import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import type { TimelineAnnotationProfile } from './timeline-model';

const ITEM_HEIGHT = 40;

type ProfilePickerProps = {
  profiles: TimelineAnnotationProfile[];
  disabled?: boolean;
  onChoose: (profile: TimelineAnnotationProfile) => void;
};

export function ProfilePickerButton({
  profiles,
  disabled = false,
  onChoose,
}: ProfilePickerProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const highlightRef = useRef(0);
  highlightRef.current = highlight;

  const choose = useCallback((index: number) => {
    const profile = profiles[index];
    setOpen(false);
    if (profile) {
      onChoose(profile);
    }
  }, [onChoose, profiles]);

  const show = useCallback(() => {
    if (disabled || profiles.length === 0) {
      return;
    }
    setHighlight(0);
    setOpen(true);
  }, [disabled, profiles.length]);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const updateHighlight = useCallback((translationY: number) => {
    const next = Math.max(
      0,
      Math.min(profiles.length - 1, Math.floor(translationY / ITEM_HEIGHT)),
    );
    setHighlight(next);
  }, [profiles.length]);

  const finishHold = useCallback(() => {
    choose(highlightRef.current);
  }, [choose]);

  const hold = useMemo(
    () => {
      'use no memo';
      return Gesture.Pan()
        .activateAfterLongPress(280)
        .enabled(!disabled)
        .onStart(() => {
          'worklet';
          runOnJS(show)();
        })
        .onUpdate((event) => {
          'worklet';
          runOnJS(updateHighlight)(Math.max(0, event.translationY));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(finishHold)();
        })
        .onFinalize((event) => {
          'worklet';
          if (event.state !== 5) {
            runOnJS(hide)();
          }
        });
    },
    [disabled, finishHold, hide, show, updateHighlight],
  );

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={hold}>
        <Pressable
          disabled={disabled}
          style={[styles.button, disabled && styles.disabled]}
          onPress={() => {
            if (open) {
              hide();
              return;
            }
            show();
          }}
        >
          <Text style={styles.buttonText}>Annotate</Text>
        </Pressable>
      </GestureDetector>
      {open ? (
        <View style={styles.menu}>
          {profiles.map((profile, index) => (
            <Pressable
              key={profile.id}
              style={[styles.item, highlight === index && styles.itemActive]}
              onPress={() => choose(index)}
            >
              <MaterialIcons
                name={profile.icon as keyof typeof MaterialIcons.glyphMap}
                size={16}
                color={profile.color}
              />
              <Text style={[styles.itemText, { color: profile.color }]}>
                {profile.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 20,
  },
  button: {
    backgroundColor: '#166534',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#dcfce7',
    fontWeight: '700',
    fontSize: 12,
  },
  menu: {
    position: 'absolute',
    top: 36,
    left: 0,
    minWidth: 168,
    backgroundColor: '#052e16',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#166534',
    paddingVertical: 4,
    zIndex: 30,
    elevation: 8,
  },
  item: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  itemActive: {
    backgroundColor: '#14532d',
  },
  itemText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
