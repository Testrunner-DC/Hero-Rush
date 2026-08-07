/**
 * 状态查询选择器 —— UI 只读查询 BattleState 的统一入口
 *
 * 从 BattlePage 渲染代码中下沉的纯游戏逻辑，不依赖 React。
 * UI 需要「从状态推导出什么可以做/显示什么」时，优先在这里加选择器，
 * 而不是在组件里直接遍历 BattleState。
 */

import type { BattleState } from "./state";
import type { CardDatabase } from "../types/card";
import { getActiveEffects } from "./effects";
import { getAllFieldCards, hasKeyword } from "./cardUtils";
import { ZONE_LIST } from "./labels";

/** 一个当前可点击发动的起动效果按钮 */
export interface ActivatableEffect {
  cardId: string;
  cardName: string;
  effectId: string;
  effectLabel: string;
}

/**
 * 收集指定玩家当前可发动的全部起动效果（手牌/场上/基地）
 *
 * 已排除本回合用过的效果（effectUsedThisTurn）与 activeSource 不匹配的效果。
 */
export function getActivatableEffects(
  state: BattleState,
  db: CardDatabase,
  playerIdx: number
): ActivatableEffect[] {
  const p = state.players[playerIdx];
  const result: ActivatableEffect[] = [];

  const scan = (cardIds: string[], source: "hand" | "field" | "base") => {
    for (const cardId of cardIds) {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) continue;
      for (const eff of getActiveEffects(card.card_no)) {
        const usedKey = `${card.card_no}-${eff.id}`;
        if (state.effectUsedThisTurn?.includes(usedKey)) continue;
        if (eff.activeSource !== source) continue;
        result.push({
          cardId,
          cardName: card.name,
          effectId: eff.id,
          effectLabel: eff.label ?? eff.id,
        });
      }
    }
  };

  scan(p.hand, "hand");
  for (const z of ZONE_LIST) {
    scan(p.field[z], "field");
  }
  scan([...p.baseCards, ...p.baseCovered], "base");

  return result;
}

/**
 * 找出指定玩家场上拥有某关键词能力的角色名（用于连击/强袭等提示）
 */
export function getKeywordCardNames(
  state: BattleState,
  db: CardDatabase,
  playerIdx: number,
  keyword: string
): string[] {
  const names: string[] = [];
  for (const { cardId } of getAllFieldCards(state.players[playerIdx])) {
    if (hasKeyword(state, cardId, keyword, db)) {
      const card = db.cards.find((c) => c.id === cardId);
      names.push(card?.name ?? cardId);
    }
  }
  return names;
}
