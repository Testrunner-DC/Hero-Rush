import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDatabase } from "../types/card";
import { ensureStarterDecks, type PreconDeckData } from "../utils/deckCode";

const publicFile = (name: string) => new URL(`../../public/${name}`, import.meta.url);
const database = JSON.parse(readFileSync(publicFile("cards.json"), "utf8")) as CardDatabase;
const knownIds = new Set(database.cards.map((card) => card.id));
const precons = [1, 2, 3, 4].map((number) => JSON.parse(readFileSync(publicFile(`precon_sd0${number}.json`), "utf8")) as PreconDeckData);

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("official SD01-SD04 starter decks", () => {
  for (const number of [1, 2, 3, 4]) {
    const code = `SD0${number}`;
    it(`${code} matches the supplied 50-card construction`, () => {
      const precon = JSON.parse(readFileSync(publicFile(`precon_sd0${number}.json`), "utf8")) as PreconDeckData;
      const counts = new Map<string, number>();
      precon.cards.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));

      expect(precon.cards).toHaveLength(50);
      expect([...counts.keys()]).toHaveLength(18);
      expect(precon.cards.every((id) => knownIds.has(id))).toBe(true);
      expect(counts.get(`${code}-001-UR`)).toBe(1);
      expect(counts.get(`${code}-002-GR`)).toBe(2);
      expect(counts.get(`${code}-003-GR`)).toBe(2);
      for (const cardNumber of [4, 5, 6]) {
        expect(counts.get(`${code}-${String(cardNumber).padStart(3, "0")}-SR`)).toBe(3);
      }
      for (let cardNumber = 7; cardNumber <= 18; cardNumber += 1) {
        expect(counts.get(`${code}-${String(cardNumber).padStart(3, "0")}-R`)).toBe(3);
      }
    });
  }

  it("seeds all four decks for a new local player exactly once", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const first = ensureStarterDecks(precons, database);
    expect(first.map((deck) => deck.name)).toEqual(precons.map((precon) => precon.name));

    localStorage.setItem("marvel-tcg-decks", JSON.stringify(first.slice(0, 3)));
    const second = ensureStarterDecks(precons, database);
    expect(second).toHaveLength(3);
  });

  it("does not overwrite an existing player's custom decks", () => {
    const existing = [{ name: "我的测试卡组", main_deck: [], rush_deck: [], created_at: "2026-08-29" }];
    vi.stubGlobal("localStorage", memoryStorage({ "marvel-tcg-decks": JSON.stringify(existing) }));
    expect(ensureStarterDecks(precons, database)).toEqual(existing);
  });
});
