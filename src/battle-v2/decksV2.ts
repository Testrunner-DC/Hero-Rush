import type { Card, CardDatabase, Deck } from "@hero-rush/game-core";
import { deckEntriesToCardIds, getRushCardIds } from "@hero-rush/game-core";
import { STARTER_PRECON_PATHS, type PreconDeckData } from "../utils/deckCode";

export interface BattleDeckOptionV2 {
  id: string;
  name: string;
  source: "official" | "mine";
  mainDeck: string[];
  rushDeck: string[];
  color: string;
}

function prefixForCards(cardIds: readonly string[]): string {
  return cardIds[0]?.split("-").slice(0, 1).join("-") || "SD01";
}

export async function loadOfficialBattleDecksV2(db: CardDatabase): Promise<BattleDeckOptionV2[]> {
  const knownIds = new Set(db.cards.map((card) => card.id));
  const precons = await Promise.all(STARTER_PRECON_PATHS.map(async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`无法读取 ${path}`);
    return response.json() as Promise<PreconDeckData>;
  }));
  return precons.map((precon, index) => {
    const mainDeck = precon.cards.filter((id) => knownIds.has(id));
    const prefix = `SD0${index + 1}`;
    return {
      id: `official:${prefix}`,
      name: precon.name,
      source: "official" as const,
      mainDeck,
      rushDeck: getRushCardIds(db, prefix),
      color: db.attributes[String(index + 1)]?.color ?? "#b91c1c",
    };
  });
}

export function localBattleDecksV2(db: CardDatabase, cardMap: Map<string, Card>, decks: readonly Deck[]): BattleDeckOptionV2[] {
  return decks.map((deck, index) => {
    const mainDeck = deckEntriesToCardIds(deck.main_deck, cardMap);
    const firstCard = db.cards.find((card) => card.id === mainDeck[0]);
    const prefix = prefixForCards(mainDeck);
    return {
      id: `mine:${deck.name}:${index}`,
      name: deck.name,
      source: "mine" as const,
      mainDeck,
      rushDeck: getRushCardIds(db, prefix),
      color: firstCard?.attribute_color ?? "#b91c1c",
    };
  }).filter((deck) => deck.mainDeck.length === 50 && deck.rushDeck.length === 9);
}
