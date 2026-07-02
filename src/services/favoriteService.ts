import { supabase } from '../lib/supabase';
import type { FavoriteRow } from '../types/database';

/** Fetch all favorites for a user */
export async function fetchFavorites(userId: string) {
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId);
  return { data: data as FavoriteRow[] | null, error };
}

/** Add a deck to user's favorites */
export async function addFavorite(userId: string, deckId: string) {
  const { data, error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, deck_id: deckId })
    .select()
    .single();
  return { data: data as FavoriteRow | null, error };
}

/** Remove a deck from user's favorites */
export async function removeFavorite(userId: string, deckId: string) {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('deck_id', deckId);
  return { error };
}

/** Check if a deck is favorited by the user */
export async function isFavorited(userId: string, deckId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('deck_id', deckId)
    .maybeSingle();
  return !error && !!data;
}
