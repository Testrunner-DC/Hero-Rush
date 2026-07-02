import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import * as deckService from '../services/deckService';
import type { DeckRow } from '../types/database';

interface UseDecksReturn {
  publishedDecks: DeckRow[];
  myDecks: DeckRow[];
  isLoading: boolean;
  error: string | null;
  refreshPublished: () => Promise<void>;
  refreshMyDecks: () => Promise<void>;
  createDeck: (title: string, description: string, cardsJson: string, isPublished?: boolean) => Promise<DeckRow | null>;
  deleteDeck: (deckId: string) => Promise<boolean>;
}

/** Hook for managing deck data from Supabase */
export function useDecks(): UseDecksReturn {
  const { user, isAuthenticated } = useAuth();
  const [publishedDecks, setPublishedDecks] = useState<DeckRow[]>([]);
  const [myDecks, setMyDecks] = useState<DeckRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPublished = useCallback(async () => {
    setError(null);
    const { data, error: err } = await deckService.fetchPublishedDecks();
    if (err) {
      setError(err.message);
      return;
    }
    setPublishedDecks((data || []) as unknown as DeckRow[]);
  }, []);

  const refreshMyDecks = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setMyDecks([]);
      return;
    }
    setError(null);
    const { data, error: err } = await deckService.fetchMyDecks(user.id);
    if (err) {
      setError(err.message);
      return;
    }
    setMyDecks(data || []);
  }, [user, isAuthenticated]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([refreshPublished(), refreshMyDecks()]).finally(() => setIsLoading(false));
  }, [refreshPublished, refreshMyDecks]);

  const createDeckHandler = useCallback(
    async (title: string, description: string, cardsJson: string, isPublished: boolean = false) => {
      if (!user) return null;
      const cards = JSON.parse(cardsJson);
      const { data, error: err } = await deckService.createDeck(
        user.id, title, description, cards, isPublished
      );
      if (err) {
        setError(err.message);
        return null;
      }
      await refreshMyDecks();
      if (isPublished) await refreshPublished();
      return data;
    },
    [user, refreshMyDecks, refreshPublished]
  );

  const deleteDeckHandler = useCallback(async (deckId: string): Promise<boolean> => {
    const { error: err } = await deckService.deleteDeck(deckId);
    if (err) {
      setError(err.message);
      return false;
    }
    await refreshMyDecks();
    await refreshPublished();
    return true;
  }, [refreshMyDecks, refreshPublished]);

  return {
    publishedDecks,
    myDecks,
    isLoading,
    error,
    refreshPublished,
    refreshMyDecks,
    createDeck: createDeckHandler,
    deleteDeck: deleteDeckHandler,
  };
}
