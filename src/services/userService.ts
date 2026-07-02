import { supabase } from '../lib/supabase';
import type { UserRow } from '../types/database';

/** Fetch profile for a given user ID */
export async function getProfile(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as UserRow;
}

/** Update nickname and/or bio for a user */
export async function updateProfile(
  userId: string,
  updates: Partial<Pick<UserRow, 'nickname' | 'bio'>>
): Promise<{ data: UserRow | null; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('users') as any)
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data: data as UserRow | null, error: error as Error | null };
}

/** Upload an avatar image to Supabase Storage and update the profile */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const publicUrl = supabase.storage
    .from('avatars')
    .getPublicUrl(path).data.publicUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('users') as any)
    .update({ avatar_url: publicUrl })
    .eq('id', userId);

  return publicUrl;
}
