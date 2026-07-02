/**
 * migration.ts — Local deck → cloud migration utility
 *
 * When a user logs in for the first time (or after clearing browser data),
 * any local decks stored in localStorage are migrated to Supabase and then
 * removed from localStorage to avoid duplicates.
 */

import { supabase } from '../lib/supabase';
import { getLocalDecks } from './deckCode';

const LOCAL_STORAGE_KEY = 'marvel-tcg-decks';

/**
 * Migrate all local decks to the cloud for a given user.
 * Returns the number of successfully migrated decks.
 * After migration, localStorage decks are cleared.
 */
export async function migrateLocalDecks(userId: string): Promise<number> {
  const localDecks = getLocalDecks();
  if (localDecks.length === 0) return 0;

  let migrated = 0;
  for (const deck of localDecks) {
    const { error } = await supabase.from('decks').insert({
      user_id: userId,
      title: deck.name,
      description: '',
      cards_json: JSON.stringify(deck.main_deck),
      is_published: true,
    });
    if (!error) {
      migrated++;
    } else {
      console.warn('Migration: failed to upload deck', deck.name, error.message);
    }
  }

  // Clear local decks after migration
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // Ignore localStorage errors in private browsing
  }

  return migrated;
}

/**
 * Check if there are any local decks that need migration.
 */
export function hasLocalDecksToMigrate(): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return false;
    const decks = JSON.parse(raw);
    return Array.isArray(decks) && decks.length > 0;
  } catch {
    return false;
  }
}
