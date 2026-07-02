import React, { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { AuthState, AuthUser, Session } from '../types/user';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import * as authService from '../services/authService';
import * as userService from '../services/userService';
import { migrateLocalDecks, hasLocalDecksToMigrate } from '../utils/migration';

export interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string, nickname: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Convert supabase Session to our lightweight Session */
function toSession(s: SupabaseSession): Session {
  return {
    access_token: s.access_token,
    expires_at: s.expires_at ?? undefined,
    user: { id: s.user.id, email: s.user.email },
  };
}

/** Build AuthUser from Supabase session + users table row */
function buildUser(
  session: SupabaseSession,
  profile: { nickname: string; avatar_url: string | null; bio: string; created_at: string } | null
): AuthUser {
  return {
    id: session.user.id,
    email: session.user.email || '',
    nickname: profile?.nickname || (session.user.user_metadata?.nickname as string) || '玩家',
    avatar_url: profile?.avatar_url || null,
    bio: profile?.bio || '',
    created_at: profile?.created_at || new Date().toISOString(),
  };
}

/** Track whether migration has been attempted this session to avoid repeat calls */
let migrationAttempted = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

  /** Fetch profile from users table and build AuthUser */
  const buildUserFromSession = useCallback(async (session: SupabaseSession): Promise<AuthUser> => {
    const profile = await userService.getProfile(session.user.id);
    return buildUser(session, profile);
  }, []);

  /** Listen to auth state changes and auto-refresh */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          const user = await buildUserFromSession(session);
          setState({
            user,
            session: toSession(session),
            isLoading: false,
            isAuthenticated: true,
          });

          // ── Data migration: local decks → cloud ──
          if (!migrationAttempted && hasLocalDecksToMigrate()) {
            migrationAttempted = true;
            try {
              const count = await migrateLocalDecks(session.user.id);
              if (count > 0) {
                console.log(`Migration: ${count} local deck(s) migrated to cloud.`);
              }
            } catch (err) {
              console.warn('Migration failed:', err);
            }
          }
        } else {
          setState({
            user: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    );

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        buildUserFromSession(session).then(async (user) => {
          setState({
            user,
            session: toSession(session),
            isLoading: false,
            isAuthenticated: true,
          });

          // ── Data migration on initial session ──
          if (!migrationAttempted && hasLocalDecksToMigrate()) {
            migrationAttempted = true;
            try {
              const count = await migrateLocalDecks(session.user.id);
              if (count > 0) {
                console.log(`Migration: ${count} local deck(s) migrated to cloud.`);
              }
            } catch (err) {
              console.warn('Migration failed:', err);
            }
          }
        });
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [buildUserFromSession]);

  /** Sign up a new user */
  const signUp = useCallback(async (email: string, password: string, nickname: string) => {
    const { error } = await authService.signUp(email, password, nickname);
    return { error: error as Error | null };
  }, []);

  /** Sign in an existing user */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authService.signIn(email, password);
    return { error: error as Error | null };
  }, []);

  /** Sign out */
  const signOutHandler = useCallback(async () => {
    await authService.signOut();
    migrationAttempted = false;
    setState({
      user: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  /** Refresh the profile (re-fetch from users table) */
  const refreshProfile = useCallback(async () => {
    if (!state.session) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const user = await buildUserFromSession(session);
    setState((prev) => ({ ...prev, user }));
  }, [state.session, buildUserFromSession]);

  const value: AuthContextValue = {
    ...state,
    signUp,
    signIn,
    signOut: signOutHandler,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
