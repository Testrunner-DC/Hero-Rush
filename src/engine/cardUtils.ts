/**
 * 卡牌辅助纯函数
 *
 * 从 BattlePage.tsx 提取的纯函数，供 engine.ts 和 BattlePage.tsx 共用。
 * 所有函数均为无副作用纯函数。
 */

import type { BattleState, Zone, PlayerState } from "./state";
import type { Card, CardDatabase } from "../types/card";
import type { Modifier, EffectContext } from "./effects/types";
import { getStaticEffects, getEffectsByCardNo, findCardOwner } from "./effects/registry";

/** 战区列表（按冲突阶段攻击顺序） */
const ZONE_LIST: Zone[] = ["vanguard", "flankLeft", "flankRight", "rear"];

/**
 * 从 Card.power 字符串解析数字战力
 * @param card 卡牌对象（可能为 undefined）
 * @returns 数字战力值，非数字或空值返回 0
 */
export function getCardPower(card: Card | undefined): number {
  if (!card || !card.power) return 0;
  const n = parseInt(card.power, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 获取玩家场上所有角色卡（含所在区域）
 * @param player 玩家状态
 * @returns 场上所有角色卡的 { cardId, zone } 列表
 */
export function getAllFieldCards(player: PlayerState): { cardId: string; zone: Zone }[] {
  const result: { cardId: string; zone: Zone }[] = [];
  for (const zone of ZONE_LIST) {
    for (const cardId of player.field[zone]) {
      result.push({ cardId, zone });
    }
  }
  return result;
}

/**
 * 在玩家场上查找指定卡牌
 * @param player 玩家状态
 * @param cardId 要查找的卡牌 id
 * @returns 找到则返回 { zone, index }，未找到返回 null
 */
export function findCardInField(
  player: PlayerState,
  cardId: string
): { zone: Zone; index: number } | null {
  for (const zone of ZONE_LIST) {
    const idx = player.field[zone].indexOf(cardId);
    if (idx >= 0) return { zone, index: idx };
  }
  return null;
}

/**
 * 判断某区域是否可以攻击（冲突阶段攻击顺序约束）
 *
 * 规则（设计文档 §8.6）：
 * - vanguard 始终可用
 * - flankLeft / flankRight 需 vanguard 完成
 * - rear 需 flankLeft 和 flankRight 都完成
 * - 已完成的区域不可再攻击
 *
 * @param state 当前游戏状态
 * @param zone 要检查的区域
 * @returns 是否可以攻击
 */
export function canZoneAttack(state: BattleState, zone: Zone): boolean {
  if (state.conflictZonesCompleted.includes(zone)) return false;
  if (zone === "vanguard") return true;
  if (zone === "flankLeft" || zone === "flankRight") {
    return state.conflictZonesCompleted.includes("vanguard");
  }
  if (zone === "rear") {
    return (
      state.conflictZonesCompleted.includes("flankLeft") &&
      state.conflictZonesCompleted.includes("flankRight")
    );
  }
  return false;
}

// ============================================================
// 战力/R值有效值计算（含修改器和 static 效果）
// ============================================================

/**
 * 获取卡牌的有效战力（基础战力 + permanent修改器 + turn修改器 + static效果）
 *
 * @param state 当前游戏状态
 * @param cardId 卡牌 ID
 * @param db 卡牌数据库
 * @returns 有效战力数值
 */
export function getEffectivePower(
  state: BattleState,
  cardId: string,
  db: CardDatabase
): number {
  const card = db.cards.find((c) => c.id === cardId);
  let basePower = getCardPower(card);

  // 累加修改器
  for (const mod of state.modifiers) {
    if (mod.targetCardId === cardId && mod.type === "power") {
      basePower += mod.value;
    }
  }

  // 累加 static 效果
  // 遍历所有场上卡牌的 static 效果
  // 注意：staticModifier 返回的 Modifier ID 应为确定性 ID（`static-${cardNo}-${effectId}`），
  // 而非 genId()。当前 getEffectivePower 直接读取 modifier.value 进行累加，
  // 不会因重复 ID 导致累加错误（每次调用都重新计算），但确定性 ID 有助于调试和去重。
  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    for (const zone of ZONE_LIST) {
      for (const fieldCardId of p.field[zone]) {
        const fieldCard = db.cards.find((c) => c.id === fieldCardId);
        if (!fieldCard) continue;

        const staticEffects = getStaticEffects(fieldCard.card_no);
        for (const effect of staticEffects) {
          if (!effect.staticModifier) continue;

          // 创建上下文
          const ctx = {
            state,
            cardId: fieldCardId,
            playerIdx: i,
            db,
          };

          // 检查 condition
          if (effect.condition && !effect.condition(ctx)) continue;

          // 获取修改器
          const modifier = effect.staticModifier(ctx);
          if (modifier && modifier.targetCardId === cardId && modifier.type === "power") {
            basePower += modifier.value;
          }
        }
      }
    }
  }

  return Math.max(0, basePower);
}

/**
 * 获取卡牌的有效 R 值（基础R + 修改器）
 *
 * @param state 当前游戏状态
 * @param cardId 卡牌 ID
 * @param db 卡牌数据库
 * @returns 有效 R 值
 */
export function getEffectiveR(
  state: BattleState,
  cardId: string,
  db: CardDatabase
): number {
  const card = db.cards.find((c) => c.id === cardId);
  let baseR = card?.r ?? 1;

  // 累加修改器
  for (const mod of state.modifiers) {
    if (mod.targetCardId === cardId && mod.type === "r") {
      baseR += mod.value;
    }
  }

  // 累加 static 效果
  // 注意：staticModifier 返回的 Modifier ID 应为确定性 ID（`static-${cardNo}-${effectId}`），
  // 而非 genId()。当前 getEffectiveR 直接读取 modifier.value 进行累加，
  // 不会因重复 ID 导致累加错误（每次调用都重新计算），但确定性 ID 有助于调试和去重。
  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    for (const zone of ZONE_LIST) {
      for (const fieldCardId of p.field[zone]) {
        const fieldCard = db.cards.find((c) => c.id === fieldCardId);
        if (!fieldCard) continue;

        const staticEffects = getStaticEffects(fieldCard.card_no);
        for (const effect of staticEffects) {
          if (!effect.staticModifier) continue;

          const ctx = {
            state,
            cardId: fieldCardId,
            playerIdx: i,
            db,
          };

          if (effect.condition && !effect.condition(ctx)) continue;

          const modifier = effect.staticModifier(ctx);
          if (modifier && modifier.targetCardId === cardId && modifier.type === "r") {
            baseR += modifier.value;
          }
        }
      }
    }
  }

  return Math.max(1, baseR);
}

/**
 * 获取卡牌的结附卡列表
 *
 * @param state 当前游戏状态
 * @param cardId 宿主卡 ID
 * @returns 结附卡 ID 数组
 */
export function getAttachments(state: BattleState, cardId: string): string[] {
  return state.attachments[cardId] ?? [];
}

/**
 * 清除所有 turn 持续时间的修改器
 * 在回合结束时调用。
 *
 * @param state 当前游戏状态
 * @returns 清除后的状态
 */
export function cleanupTurnModifiers(state: BattleState): BattleState {
  const remaining = state.modifiers.filter((m) => m.duration !== "turn");
  if (remaining.length === state.modifiers.length) return state;

  return {
    ...state,
    modifiers: remaining,
    log: state.modifiers.length > remaining.length
      ? [...state.log, `🧹 清除${state.modifiers.length - remaining.length}个临时修改器`]
      : state.log,
  };
}

// ============================================================
// 关键词能力检查（T02 新增）
// ============================================================

/**
 * 检查卡牌是否拥有指定关键词能力
 *
 * 检查来源（按优先级）：
 * 1. state.temporaryAbilities[cardId] — 本回合获得的能力（如 SD02-016 获得【强袭】）
 * 2. 效果注册表中 effect.keywords 字段 — 常驻关键词（如 SD01-017 条件获得【连击】）
 *    对于条件关键词，还需检查 effect.condition 是否满足
 *
 * 关键词名称统一使用英文：
 * "combo" = 连击, "assault" = 强袭, "airRaid" = 空袭,
 * "intercept" = 拦截, "unique" = 唯一, "counter" = 应对
 *
 * @param state 游戏状态
 * @param cardId 卡牌 ID
 * @param keyword 关键词名称
 * @param db 卡牌数据库
 * @returns 是否拥有该关键词
 */
export function hasKeyword(
  state: BattleState,
  cardId: string,
  keyword: string,
  db: CardDatabase
): boolean {
  // 1. 检查 temporaryAbilities（本回合获得的能力）
  const tempAbilities = state.temporaryAbilities?.[cardId];
  if (tempAbilities && tempAbilities.includes(keyword)) {
    return true;
  }

  // 2. 检查效果注册表中的 keywords 字段
  const card = db.cards.find((c) => c.id === cardId);
  if (!card) return false;

  const effects = getEffectsByCardNo(card.card_no);
  const ownerIdx = findCardOwner(state, cardId);

  for (const effect of effects) {
    if (!effect.keywords || !effect.keywords.includes(keyword)) continue;

    // 对于条件关键词，需检查 condition 是否满足
    if (effect.condition && ownerIdx >= 0) {
      const ctx: EffectContext = {
        state,
        cardId,
        playerIdx: ownerIdx,
        db,
      };
      if (!effect.condition(ctx)) continue;
    }

    return true;
  }

  return false;
}
