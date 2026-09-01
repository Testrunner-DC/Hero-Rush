import type { Card, DeckEntry } from "../types/card";

/** 构筑规则使用卡面完整名称；不同卡号只要名称完全一致，就共享投入上限。 */
export function countDeckCardsWithExactName(
  deck: readonly DeckEntry[],
  cardMap: ReadonlyMap<string, Card>,
  name: string,
): number {
  return deck.reduce((total, entry) => (
    cardMap.get(entry.card_no)?.name === name ? total + entry.count : total
  ), 0);
}

/** 默认构筑顺序：颜色 → 等级 → 战力 → 编号，均按数值/编号升序。 */
export function compareCardsByDefaultDeckOrder(left: Card, right: Card): number {
  const leftPower = Number(left.power ?? 0);
  const rightPower = Number(right.power ?? 0);
  return left.attribute - right.attribute
    || left.cost - right.cost
    || leftPower - rightPower
    || left.card_no.localeCompare(right.card_no);
}
