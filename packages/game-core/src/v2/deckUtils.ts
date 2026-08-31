import type { Card, CardDatabase, DeckEntry } from "../types/card";

/** 为指定系列选择最高罕贵冲击卡，并生成标准 9 张冲击卡组。 */
export function getRushCardIds(db: CardDatabase, prefix: string): string[] {
  const best = db.cards
    .filter((card) => card.card_no.startsWith(prefix) && card.card_type === 2)
    .reduce<Card | null>((current, card) => !current || card.rarity > current.rarity ? card : current, null);
  return best ? Array<string>(9).fill(best.id) : [];
}

/** 将卡组条目展开为对战使用的卡牌定义 ID 列表。 */
export function deckEntriesToCardIds(entries: readonly DeckEntry[], cardMap: ReadonlyMap<string, Card>): string[] {
  return entries.flatMap((entry) => {
    const card = cardMap.get(entry.card_no);
    return card ? Array<string>(entry.count).fill(card.id) : [];
  });
}
