import { supabase } from '../lib/supabase';
import type { DeckRow } from '../types/database';
import type { DeckEntry } from '../types/card';

/** Fetch all published decks with author info */
export async function fetchPublishedDecks() {
  const { data, error } = await supabase
    .from('decks')
    .select('*, users!decks_user_id_fkey(nickname, avatar_url)')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  return { data, error };
}

/** Fetch decks owned by a specific user */
export async function fetchMyDecks(userId: string) {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: data as DeckRow[] | null, error };
}

/** Create a new deck in the database */
export async function createDeck(
  userId: string,
  title: string,
  description: string,
  cards: DeckEntry[],
  isPublished: boolean = false
) {
  const { data, error } = await supabase
    .from('decks')
    .insert({
      user_id: userId,
      title,
      description,
      cards_json: JSON.stringify(cards),
      is_published: isPublished,
    })
    .select()
    .single();
  return { data: data as DeckRow | null, error };
}

/** Delete a deck by ID */
export async function deleteDeck(deckId: string) {
  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  return { error };
}
