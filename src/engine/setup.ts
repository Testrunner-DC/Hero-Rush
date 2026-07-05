/**
 * 开局准备逻辑 —— 卡组数据 → 对战可用的卡牌 ID 列表
 *
 * 从 BattlePage 下沉的纯游戏逻辑，不依赖 React。
 */

import type { CardDatabase, Card, DeckEntry } from "../types/card";

/**
 * 为指定系列前缀找出最佳（稀有度最高）冲击卡，铺满 9 张冲击卡组
 *
 * @param db 卡牌数据库
 * @param prefix 系列前缀（如 "SD01"）
 * @returns 9 张同一冲击卡的 ID 数组；找不到则返回空数组
 */
export function getRushCardIds(db: CardDatabase, prefix: string): string[] {
  const rushCards = db.cards.filter(
    (c) => c.card_no.startsWith(prefix) && c.card_type === 2
  );
  const best = rushCards.reduce<string | null>((best, c) => {
    if (!best) return c.id;
    const bestCard = db.cards.find((x) => x.id === best)!;
    return c.rarity > bestCard.rarity ? c.id : best;
  }, null);
  return best ? Array(9).fill(best) : [];
}

/**
 * 把 DeckEntry[]（card_no + count）展开为卡牌 ID 数组
 *
 * @param entries 卡组条目
 * @param cardMap card_no → Card 的映射
 * @returns 展开后的卡牌 ID 数组（查不到的条目静默跳过）
 */
export function deckEntriesToCardIds(
  entries: DeckEntry[],
  cardMap: Map<string, Card>
): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    const card = cardMap.get(entry.card_no);
    if (card) {
      for (let i = 0; i < entry.count; i++) {
        ids.push(card.id);
      }
    }
  }
  return ids;
}
