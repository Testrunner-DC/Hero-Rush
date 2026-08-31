import { validateDeckCardPoolV2, type CardDatabase } from "@hero-rush/game-core";
import type { DeckSelection } from "@hero-rush/protocol";

export type ValidatedDeckV2 = { deck: string[]; rushDeck: string[] };
export type DeckValidationResultV2 = ValidatedDeckV2 | { error: string };

export function validateDeckSelectionV2(
  selection: DeckSelection,
  catalog: CardDatabase,
  enforceCardPool: boolean,
): DeckValidationResultV2 {
  if (!selection.deck || !selection.rushDeck) {
    return { error: "V2 当前要求客户端提交已锁定的 50+9 卡组快照" };
  }
  if (selection.deck.length !== 50 || selection.rushDeck.length !== 9) {
    return { error: "V2 卡组快照必须包含 50 张主卡和 9 张冲击卡" };
  }
  const cards = new Map(catalog.cards.map((card) => [card.id, card]));
  const mainDefinitions = selection.deck.map((id) => cards.get(id));
  const rushDefinitions = selection.rushDeck.map((id) => cards.get(id));
  if (mainDefinitions.some((card) => !card) || rushDefinitions.some((card) => !card)) {
    return { error: "卡组包含服务器目录中不存在的卡牌" };
  }
  if (mainDefinitions.some((card) => card!.card_type !== 1)
    || rushDefinitions.some((card) => card!.card_type !== 2)) {
    return { error: "主卡组或冲击卡组包含错误类型的卡牌" };
  }
  const nameCounts = new Map<string, number>();
  const colors = new Set<number>();
  for (const card of mainDefinitions) {
    nameCounts.set(card!.name, (nameCounts.get(card!.name) ?? 0) + 1);
    colors.add(card!.attribute);
  }
  if ([...nameCounts.values()].some((count) => count > 3)) {
    return { error: "名称相同的角色卡合计最多投入 3 张" };
  }
  if (colors.size > 2) return { error: "主卡组最多包含 2 种属性" };
  if (enforceCardPool) {
    const coverage = validateDeckCardPoolV2(selection.deck, catalog.cards);
    if (!coverage.ok) {
      return { error: `卡组包含尚未完成 V2 效果实现的卡牌：${coverage.missingCardNos.slice(0, 8).join("、")}` };
    }
  }
  return { deck: [...selection.deck], rushDeck: [...selection.rushDeck] };
}
