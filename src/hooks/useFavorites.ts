import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import * as favoriteService from '../services/favoriteService';

interface UseFavoritesReturn {
  favoriteDeckIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  toggleFavorite: (deckId: string) => Promise<void>;
  isFavorited: (deckId: string) => boolean;
  refresh: () => Promise<void>;
}

/** Hook for managing user's deck favorites */
export function useFavorites(): UseFavoritesReturn {
  const { user, isAuthenticated } = useAuth();
  const [favoriteDeckIds, setFavoriteDeckIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setFavoriteDeckIds(new Set());
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await favoriteService.fetchFavorites(user.id);
    if (err) {
      setError(err.message);
      setIsLoading(false);
      return;
    }
    const ids = new Set<string>((data || []).map((f) => f.deck_id));
    setFavoriteDeckIds(ids);
    setIsLoading(false);
  }, [user, isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleFavorite = useCallback(async (deckId: string) => {
    if (!user) return;
    if (favoriteDeckIds.has(deckId)) {
      const { error: err } = await favoriteService.removeFavorite(user.id, deckId);
      if (err) {
        setError(err.message);
        return;
      }
      setFavoriteDeckIds((prev) => {
        const next = new Set(prev);
        next.delete(deckId);
        return next;
      });
    } else {
      const { error: err } = await favoriteService.addFavorite(user.id, deckId);
      if (err) {
        setError(err.message);
        return;
      }
      setFavoriteDeckIds((prev) => {
        const next = new Set(prev);
        next.add(deckId);
        return next;
      });
    }
  }, [user, favoriteDeckIds]);

  const checkIsFavorited = useCallback(
    (deckId: string) => favoriteDeckIds.has(deckId),
    [favoriteDeckIds]
  );

  return {
    favoriteDeckIds,
    isLoading,
    error,
    toggleFavorite,
    isFavorited: checkIsFavorited,
    refresh,
  };
}
