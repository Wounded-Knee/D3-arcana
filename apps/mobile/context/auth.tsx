import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, fetchCurrentUser, type User } from '@/lib/api';
import { RealtimeClient } from '@/lib/realtime';

const REALTIME_TIMEOUT_MS = 10_000;

interface AuthContextValue {
  token: string | null;
  user: User | null;
  realtime: RealtimeClient | null;
  isLoading: boolean;
  error: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [realtime, setRealtime] = useState<RealtimeClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    realtime?.disconnect();
    setToken(null);
    setUser(null);
    setRealtime(null);
    setError(null);
  }, [realtime]);

  const signIn = useCallback(async (nextToken: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = await fetchCurrentUser(nextToken);
      const client = new RealtimeClient(nextToken);
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('WebSocket connection timed out')),
            REALTIME_TIMEOUT_MS,
          );
        }),
      ]);

      setToken(nextToken);
      setUser(currentUser);
      setRealtime(client);
    } catch (err) {
      realtime?.disconnect();

      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Sign in failed';

      setToken(null);
      setUser(null);
      setRealtime(null);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [signOut]);

  const value = useMemo(
    () => ({
      token,
      user,
      realtime,
      isLoading,
      error,
      signIn,
      signOut,
    }),
    [token, user, realtime, isLoading, error, signIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
