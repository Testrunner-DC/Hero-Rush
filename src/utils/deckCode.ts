import type { Deck, DeckEntry, CardDatabase } from "../types/card";

/**
 * Encode a deck into a compact base64 string for URL sharing.
 * Format: name|card_no:count,card_no:count,...|card_no:count,...
 */
export function encodeDeck(deck: Deck): string {
  const main = deck.main_deck.map((e) => `${e.card_no}:${e.count}`).join(",");
  const rush = deck.rush_deck.map((e) => `${e.card_no}:${e.count}`).join(",");
  const raw = `${deck.name || "未命名卡组"}|${main}|${rush}`;
  return btoa(unescape(encodeURIComponent(raw)));
}

export function decodeDeck(code: string): Deck | null {
  try {
    const raw = decodeURIComponent(escape(atob(code)));
    const [name, main, rush] = raw.split("|");
    const parseEntries = (str: string): DeckEntry[] => {
      if (!str) return [];
      return str
        .split(",")
        .filter(Boolean)
        .map((pair) => {
          const [card_no, count] = pair.split(":");
          return { card_no, count: parseInt(count, 10) || 1 };
        });
    };
    return {
      name: name || "未命名卡组",
      main_deck: parseEntries(main),
      rush_deck: parseEntries(rush),
      created_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveDeckToLocal(deck: Deck): void {
  const decks = getLocalDecks();
  const idx = decks.findIndex((d) => d.name === deck.name);
  if (idx >= 0) {
    decks[idx] = deck;
  } else {
    decks.push(deck);
  }
  localStorage.setItem("marvel-tcg-decks", JSON.stringify(decks));
}

export function getLocalDecks(): Deck[] {
  try {
    const raw = localStorage.getItem("marvel-tcg-decks");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteLocalDeck(name: string): void {
  const decks = getLocalDecks().filter((d) => d.name !== name);
  localStorage.setItem("marvel-tcg-decks", JSON.stringify(decks));
}

/** Precon deck data format as stored in public/precon_sdXX.json files. */
export interface PreconDeckData {
  name: string;
  card_type: number;   // 1=character, 2=impact
  format: string;
  cards: string[];     // Array of card IDs (e.g., "SD01-001-SEC")
  source: string;
}

/**
 * Convert a precon deck (ID list format) into a standard Deck (DeckEntry format).
 * Groups cards by card_no and counts duplicates.
 */
export function preconToDeck(precon: PreconDeckData, db: CardDatabase): Deck {
  // Build id -> card_no lookup for efficient resolution
  const idToCardNo = new Map<string, string>();
  for (const card of db.cards) {
    idToCardNo.set(card.id, card.card_no);
  }

  const counts: Record<string, number> = {}; // card_no -> count
  let unresolved = 0;

  for (const id of precon.cards) {
    let cardNo = idToCardNo.get(id);
    if (!cardNo) {
      // Fallback: extract card_no from id pattern (e.g., "SD01-001-SEC" -> "SD01-001")
      const parts = id.split("-");
      if (parts.length >= 3) {
        cardNo = parts.slice(0, 2).join("-");
      } else {
        cardNo = id;
      }
      unresolved++;
    }
    counts[cardNo] = (counts[cardNo] || 0) + 1;
  }

  if (unresolved > 0) {
    console.warn(
      `preconToDeck: ${unresolved} card(s) not found in database for "${precon.name}", using fallback card_no extraction`
    );
  }

  const main_deck: DeckEntry[] = Object.entries(counts).map(([card_no, count]) => ({
    card_no,
    count,
  }));

  return {
    name: precon.name,
    main_deck,
    rush_deck: [],
    created_at: new Date().toISOString(),
  };
}

/**
 * Extract a deck code from user input.
 * Handles both raw base64 codes and share URLs containing "#deck=...".
 */
export function extractDeckCode(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/#deck=(.+)$/);
  if (match) {
    return match[1];
  }
  return trimmed;
}
