import { supabase } from '../lib/supabase';
import { resolveAuthIdentifier } from '../utils/authIdentifier';

/** Register a new username (legacy email identifiers remain supported). */
export async function signUp(identifier: string, password: string, nickname: string) {
  let identity;
  try {
    identity = resolveAuthIdentifier(identifier);
  } catch (error) {
    return { data: null, error: error as Error };
  }
  const { data, error } = await supabase.auth.signUp({
    email: identity.email,
    password,
    options: { data: { nickname, username: identity.username } }
  });
  return { data, error };
}

/** Sign in with a username or a legacy email address. */
export async function signIn(identifier: string, password: string) {
  let identity;
  try {
    identity = resolveAuthIdentifier(identifier);
  } catch (error) {
    return { data: null, error: error as Error };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: identity.email, password });
  return { data, error };
}

/** Sign out the current user */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/** Get the current session (or null if not logged in) */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
