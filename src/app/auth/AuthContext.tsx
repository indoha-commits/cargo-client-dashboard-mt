import React, { createContext, useContext, useState } from 'react';
import { initSupabaseAuth, loginWithPassword, logout } from './supabase';
import { redirectAfterLogin } from './roleRedirect';

export type AuthState = {
  ready: boolean;
  authenticated: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    initSupabaseAuth(({ authenticated, error }) => {
      if (cancelled) return;
      setAuthError(error);
      setAuthenticated(authenticated);
      setReady(true);
    })
      .then((u) => {
        unsubscribe = u;
      })
      .catch((e) => {
        // Should be rare (initSupabaseAuth already catches config errors),
        // but ensure we never hang on Loading.
        if (cancelled) return;
        setAuthError(e instanceof Error ? e.message : String(e));
        setAuthenticated(false);
        setReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value: AuthState = {
    ready,
    authenticated,
    authError,
    login: async (email: string, password: string) => {
      await loginWithPassword(email, password);
      await redirectAfterLogin();
    },
    logout: async () => {
      await logout();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
