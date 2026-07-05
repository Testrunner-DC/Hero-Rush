/**
 * 效果注册表 — 全局 card_no → CardEffect[] 映射
 *
 * 在模块加载时（registerAllEffects）注册所有卡牌效果。
 * 引擎通过 triggerEffectsByTiming 查找并执行触发型效果。
 */

import type { BattleState } from "../state";
import type { CardDatabase } from "../../types/card";
import type { CardEffect, EffectContext, TriggerTiming } from "./types";

// ============================================================
// 全局注册表
// ============================================================

/** 全局效果注册表：card_no → CardEffect[] */
export const EFFECT_REGISTRY: Map<string, CardEffect[]> = new Map();

/** 战区列表 */
const ZONE_LIST = ["vanguard", "flankLeft", "flankRight", "rear"] as const;

/**
 * 注册一个卡牌效果
 * @param effect 卡牌效果定义
 */
export function registerEffect(effect: CardEffect): void {
  const existing = EFFECT_REGISTRY.get(effect.cardNo) ?? [];
  existing.push(effect);
  EFFECT_REGISTRY.set(effect.cardNo, existing);
}

/**
 * 批量注册卡牌效果
 * @param effects 卡牌效果定义数组
 */
export function registerEffects(effects: CardEffect[]): void {
  for (const effect of effects) {
    registerEffect(effect);
  }
}

/**
 * 获取某张卡的所有效果
 * @param cardNo 卡牌编号（如 "SD01-001"）
 * @returns 该卡牌的所有效果定义
 */
export function getEffectsByCardNo(cardNo: string): CardEffect[] {
  return EFFECT_REGISTRY.get(cardNo) ?? [];
}

/**
 * 获取某张卡的所有 static 效果
 * @param cardNo 卡牌编号
 * @returns 该卡牌的所有 static 类型效果
 */
export function getStaticEffects(cardNo: string): CardEffect[] {
  return getEffectsByCardNo(cardNo).filter((e) => e.category === "static");
}

/**
 * 获取某张卡的所有 counter 效果
 * @param cardNo 卡牌编号
 * @returns 该卡牌的所有 counter 类型效果
 */
export function getCounterEffects(cardNo: string): CardEffect[] {
  return getEffectsByCardNo(cardNo).filter((e) => e.category === "counter");
}

/**
 * 获取某张卡的所有 active（起动型）效果
 *
 * 用于行动阶段显示可起动的效果列表。
 * 不包含 isCounterActive=true 的效果（那些通过 getCounterActiveEffects 获取）。
 *
 * @param cardNo 卡牌编号
 * @returns 该卡牌的所有非应对·起动型 active 效果
 */
export function getActiveEffects(cardNo: string): CardEffect[] {
  return getEffectsByCardNo(cardNo).filter(
    (e) => e.category === "active" && !e.isCounterActive
  );
}

/**
 * 获取某张卡的所有应对·起动效果（isCounterActive=true 的 active 效果）
 *
 * 用于应对阶段显示可使用的应对·起动效果列表。
 * 如 SD01-002/016 的应对·起动效果。
 *
 * @param cardNo 卡牌编号
 * @returns 该卡牌的所有应对·起动型效果
 */
export function getCounterActiveEffects(cardNo: string): CardEffect[] {
  return getEffectsByCardNo(cardNo).filter(
    (e) => e.category === "active" && e.isCounterActive === true
  );
}

// ============================================================
// 辅助：查找卡牌所属玩家
// ============================================================

/**
 * 查找卡牌所属玩家 index
 * @param state 当前游戏状态
 * @param cardId 卡牌 ID
 * @returns 玩家 index (0 或 1)，未找到返回 -1
 */
export function findCardOwner(state: BattleState, cardId: string): number {
  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    for (const z of ZONE_LIST) {
      if (p.field[z].includes(cardId)) return i;
    }
    if (p.baseCards.includes(cardId)) return i;
    if (p.baseCovered.includes(cardId)) return i;
    if (p.hand.includes(cardId)) return i;
    // 结附卡也可能在 attachments 中
    for (const attachIds of Object.values(state.attachments)) {
      if (attachIds.includes(cardId)) return i;
    }
  }
  return -1;
}

// ============================================================
// 触发效果执行
// ============================================================

/**
 * 触发指定卡牌的指定时机效果
 *
 * 查找卡牌的所有 trigger 类型效果，过滤匹配 timing 的，
 * 依次检查 triggerCondition 和 cost，通过的执行 execute。
 *
 * @param state 当前游戏状态
 * @param cardId 效果来源卡牌 ID
 * @param timing 触发时机
 * @param db 卡牌数据库
 * @param sourceCardId 触发源卡牌 ID（可选，默认同 cardId）
 * @param sourcePlayerIdx 触发源玩家 index（可选）
 * @returns 所有效果执行后的累积状态
 */
export function triggerEffectsByTiming(
  state: BattleState,
  cardId: string,
  timing: TriggerTiming,
  db: CardDatabase,
  sourceCardId?: string,
  sourcePlayerIdx?: number
): BattleState {
  const card = db.cards.find((c) => c.id === cardId);
  if (!card) return state;

  const effects = getEffectsByCardNo(card.card_no);
  if (effects.length === 0) return state;

  // 过滤：trigger 类型 + 匹配 timing
  const triggered = effects.filter(
    (e) => e.category === "trigger" && e.trigger === timing
  );
  if (triggered.length === 0) return state;

  const ownerIdx = findCardOwner(state, cardId);
  if (ownerIdx < 0) return state;

  let currentState = state;

  for (const effect of triggered) {
    // Bug 3 修正：检查"回合1次"限制（trigger 型效果的 once 旗标也需在 triggerEffectsByTiming 中检查）
    const usedKey = `${card.card_no}-${effect.id}`;
    if (effect.once && (currentState.effectUsedThisTurn?.includes(usedKey) ?? false)) {
      continue;
    }

    const ctx: EffectContext = {
      state: currentState,
      cardId,
      playerIdx: ownerIdx,
      db,
      triggerInfo: {
        event: timing,
        sourceCardId: sourceCardId ?? cardId,
        sourcePlayerIdx: sourcePlayerIdx ?? ownerIdx,
      },
    };

    // 检查触发条件
    if (effect.triggerCondition && !effect.triggerCondition(ctx)) {
      continue;
    }

    // 检查费用
    if (effect.cost && !effect.cost(ctx)) {
      continue;
    }

    // 执行效果
    const hadPending = !!currentState.pendingTargetSelection;
    currentState = effect.execute({
      ...ctx,
      state: currentState,
    });

    // 效果挂起等待玩家选目标：once 标记推迟到 SELECT_TARGETS 完成时执行，
    // 并停止后续效果（避免覆盖 pendingTargetSelection）
    if (!hadPending && currentState.pendingTargetSelection) {
      break;
    }

    // 标记"回合1次"（与引擎层 handleActivateEffect 使用相同的 key 格式）
    if (effect.once) {
      currentState = {
        ...currentState,
        effectUsedThisTurn: [...(currentState.effectUsedThisTurn ?? []), usedKey],
      };
    }
  }

  return currentState;
}

/**
 * 触发所有场上角色的指定时机效果（用于 onTurnStart/onTurnEnd 等全局事件）
 *
 * 活跃玩家的效果优先执行。
 *
 * @param state 当前游戏状态
 * @param timing 触发时机
 * @param db 卡牌数据库
 * @param playerIdx 限定的玩家 index（仅触发该玩家场上卡牌的效果）
 * @returns 所有效果执行后的累积状态
 */
export function triggerAllFieldEffects(
  state: BattleState,
  timing: TriggerTiming,
  db: CardDatabase,
  playerIdx: number
): BattleState {
  let currentState = state;
  const p = state.players[playerIdx];

  for (const z of ZONE_LIST) {
    for (const cardId of p.field[z]) {
      currentState = triggerEffectsByTiming(currentState, cardId, timing, db);
    }
  }

  return currentState;
}

/**
 * 触发所有友方角色的 onAllyDefeated 效果
 *
 * 当某玩家的一张角色被撤退时，检查该玩家所有场上角色是否有 onAllyDefeated 效果。
 *
 * @param state 当前游戏状态
 * @param defeatedCardId 被撤退的卡牌 ID
 * @param playerIdx 被撤退卡牌的所属玩家
 * @param db 卡牌数据库
 * @returns 所有效果执行后的累积状态
 */
export function triggerAllyDefeatedEffects(
  state: BattleState,
  defeatedCardId: string,
  playerIdx: number,
  db: CardDatabase
): BattleState {
  let currentState = state;
  const p = state.players[playerIdx];

  for (const z of ZONE_LIST) {
    for (const cardId of p.field[z]) {
      if (cardId === defeatedCardId) continue;
      currentState = triggerEffectsByTiming(
        currentState,
        cardId,
        "onAllyDefeated",
        db,
        defeatedCardId,
        playerIdx
      );
    }
  }

  return currentState;
}
