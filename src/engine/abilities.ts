/**
 * 能力系统骨架 — 数据驱动能力定义与解析
 *
 * 为卡牌效果预留的"主动/触发/静态"能力框架。
 * 当前 registeredAbilities 始终为空数组，resolveAbility 框架就绪。
 * 参考 Netrunner resolve-ability：condition → cost → effect → once 标记
 */

import type { BattleState } from "./state";
import type { Ability, AbilityContext } from "./types";
import type { CardEffect, EffectContext } from "./effects/types";
import { getEffectsByCardNo, registerEffects } from "./effects/registry";
import type { CardDatabase } from "../types/card";

/**
 * 注册能力到游戏状态
 * @param state 当前游戏状态
 * @param ability 要注册的能力
 * @returns 更新后的状态
 */
export function registerAbility(state: BattleState, ability: Ability): BattleState {
  return {
    ...state,
    registeredAbilities: [...state.registeredAbilities, ability],
  };
}

/**
 * 注销能力
 * @param state 当前游戏状态
 * @param id 能力 id
 * @returns 更新后的状态
 */
export function unregisterAbility(state: BattleState, id: string): BattleState {
  return {
    ...state,
    registeredAbilities: state.registeredAbilities.filter((a) => a.id !== id),
  };
}

/**
 * 统一能力解析器 — 能力执行的唯一入口
 *
 * 执行流程：
 * 1. 检查 condition（若返回 false，不执行）
 * 2. 检查 cost（若返回 false，不执行）
 * 3. 执行 effect，获得新状态
 * 4. 若 once=true，注销该能力
 * 5. 返回新状态（调用方负责 checkpoint）
 *
 * @param state 当前游戏状态
 * @param ability 要执行的能力
 * @param context 能力执行上下文
 * @returns 执行后的新状态
 */
export function resolveAbility(
  state: BattleState,
  ability: Ability,
  context: AbilityContext
): BattleState {
  // Step 1: 条件检查
  if (ability.condition && !ability.condition(context)) {
    return state;
  }

  // Step 2: 费用检查
  if (ability.cost && !ability.cost(context)) {
    return state;
  }

  // Step 3: 执行效果
  let newState = ability.effect(context);

  // Step 4: once 能力注销
  if (ability.once) {
    newState = {
      ...newState,
      registeredAbilities: newState.registeredAbilities.filter((a) => a.id !== ability.id),
    };
  }

  // Step 5: 返回新状态（调用方负责 checkpoint）
  return newState;
}

/**
 * 查询某张卡牌的所有已注册能力
 * @param state 当前游戏状态
 * @param sourceCardId 来源卡牌 id
 * @returns 该卡牌的所有能力
 */
export function getAbilitiesByCard(state: BattleState, sourceCardId: string): Ability[] {
  return state.registeredAbilities.filter((a) => a.sourceCardId === sourceCardId);
}

// ============================================================
// 卡牌效果系统接口
// ============================================================

/**
 * 获取某张卡的所有卡牌效果（通过 card_no 查找注册表）
 * @param cardNo 卡牌编号
 * @returns 该卡牌的所有效果定义
 */
export function getCardEffects(cardNo: string): CardEffect[] {
  return getEffectsByCardNo(cardNo);
}

/**
 * 批量注册卡牌效果到全局注册表
 * @param effects 卡牌效果数组
 */
export function registerCardEffects(effects: CardEffect[]): void {
  registerEffects(effects);
}

/**
 * 按 card_no 查找并执行卡牌效果
 *
 * 查找该卡牌的所有效果，依次检查 condition 和 cost，通过的执行 execute。
 *
 * @param state 当前游戏状态
 * @param cardId 效果来源卡牌 ID
 * @param ctx 效果上下文（需包含 db、playerIdx）
 * @param db 卡牌数据库
 * @returns 所有效果执行后的累积状态
 */
export function resolveCardEffect(
  state: BattleState,
  cardId: string,
  ctx: EffectContext,
  db: CardDatabase
): BattleState {
  const card = db.cards.find((c) => c.id === cardId);
  if (!card) return state;

  const effects = getEffectsByCardNo(card.card_no);
  if (effects.length === 0) return state;

  let currentState = state;

  for (const effect of effects) {
    // 跳过 static 和 trigger（这些由引擎在特定时机触发）
    if (effect.category === "static" || effect.category === "trigger") continue;

    const effectCtx: EffectContext = { ...ctx, state: currentState, cardId };

    // 检查 condition
    if (effect.condition && !effect.condition(effectCtx)) continue;

    // 检查 cost
    if (effect.cost && !effect.cost(effectCtx)) continue;

    // 执行效果
    currentState = effect.execute({ ...effectCtx, state: currentState });
  }

  return currentState;
}
