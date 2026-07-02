import { supabase } from '../lib/supabase';

/** Register a new user with email, password, and nickname */
export async function signUp(email: string, password: string, nickname: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname } }
  });
  return { data, error };
}

/** Sign in with email and password */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
