import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { TimelineOrientation } from '@/components/timeline/timeline-layout';
import { useAuth } from '@/context/auth';
import {
  fetchUserPreferences,
  updateUserPreferences,
} from '@/lib/api';

function parseOrientation(value: string | null | undefined): TimelineOrientation {
  return value === 'vertical' ? 'vertical' : 'horizontal';
}

interface PreferencesContextValue {
  timelineOrientation: TimelineOrientation;
  setTimelineOrientation: (orientation: TimelineOrientation) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [timelineOrientation, setTimelineOrientationState] =
    useState<TimelineOrientation>('horizontal');

  useEffect(() => {
    if (!token) {
      setTimelineOrientationState('horizontal');
      return;
    }

    let cancelled = false;
    void fetchUserPreferences(token)
      .then((preferences) => {
        if (!cancelled) {
          setTimelineOrientationState(
            parseOrientation(preferences.timelineOrientation),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTimelineOrientationState('horizontal');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const setTimelineOrientation = useCallback(
    (orientation: TimelineOrientation) => {
      setTimelineOrientationState((current) => {
        if (current === orientation) {
          return current;
        }

        if (token) {
          void updateUserPreferences(token, {
            timelineOrientation: orientation,
          }).catch(() => {
            setTimelineOrientationState(current);
          });
        }

        return orientation;
      });
    },
    [token],
  );

  const value = useMemo(
    () => ({
      timelineOrientation,
      setTimelineOrientation,
    }),
    [setTimelineOrientation, timelineOrientation],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }

  return context;
}
