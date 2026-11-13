'use client';

import * as React from 'react';

import { hasPermission, type Permission } from '@/lib/auth/permissions';
import { clearAccessToken, setAccessToken } from '@/lib/api/session-token';
import { getServices } from '@/services';
import type { Session, User } from '@/types';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password?: string) => Promise<User>;
  signOut: () => Promise<void>;
  updateProfile: (input: { name: string; title: string }) => Promise<User>;
  can: (permission: Permission) => boolean;
  isDevelopmentIdentity: boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [session, setSession] = React.useState<Session | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const services = getServices();
        const current = await services.auth.getSession();
        if (cancelled) return;
        setSession(current);
        setStatus(current ? 'authenticated' : 'anonymous');
      } catch {
        clearAccessToken();
        if (!cancelled) {
          setSession(null);
          setStatus('anonymous');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = React.useCallback(async (email: string, password?: string) => {
    const services = getServices();
    const next = await services.auth.signIn(email, password);
    if (next.accessToken) setAccessToken(next.accessToken);
    setSession(next);
    setStatus('authenticated');
    return next.user;
  }, []);

  const updateProfile = React.useCallback(async (input: { name: string; title: string }) => {
    const services = getServices();
    const user = await services.auth.updateProfile(input);
    setSession((previous) => (previous ? { ...previous, user } : previous));
    return user;
  }, []);

  const signOut = React.useCallback(async () => {
    const services = getServices();
    try {
      await services.auth.signOut();
    } finally {
      clearAccessToken();
      setSession(null);
      setStatus('anonymous');
    }
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signIn,
      signOut,
      updateProfile,
      can: (permission: Permission) => (session?.user ? hasPermission(session.user.role, permission) : false),
      isDevelopmentIdentity: session?.development ?? false,
    }),
    [session, signIn, signOut, updateProfile, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
