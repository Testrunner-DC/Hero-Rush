/**
 * 效果系统条件谓词函数
 *
 * 提供复用的条件判定函数，供效果定义的 condition/cost 字段使用。
 * 所有函数为纯函数，无副作用。
 */

import type { BattleState, Zone } from "../state";
import type { Card, CardDatabase } from "../../types/card";

/** 战区列表 */
const ZONE_LIST: Zone[] = ["vanguard", "flankLeft", "flankRight", "rear"];

// ============================================================
// 特征判定
// ============================================================

/**
 * 检查卡牌是否拥有指定特征
 * @param card 卡牌对象
 * @param featureId 特征 ID（1=人类, 2=复仇者联盟, 3=机械, 等）
 * @returns 是否拥有该特征
 */
export function hasFeature(card: Card | undefined, featureId: number): boolean {
  if (!card || !card.feature) return false;
  const features = card.feature.split(",").map((s) => parseInt(s.trim(), 10));
  return features.includes(featureId);
}

/**
 * 检查卡牌是否拥有指定属性
 * @param card 卡牌对象
 * @param attributeId 属性 ID（1=科技/红色, 2=正义/黄色, 7=通用）
 * @returns 是否拥有该属性
 */
export function hasAttribute(card: Card | undefined, attributeId: number): boolean {
  if (!card) return false;
  return card.attribute === attributeId;
}

// ============================================================
// 场上计数
// ============================================================

/**
 * 获取我方战区角色数
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @returns 战区角色总数
 */
export function fieldCount(state: BattleState, playerIdx: number): number {
  const p = state.players[playerIdx];
  let count = 0;
  for (const z of ZONE_LIST) {
    count += p.field[z].length;
  }
  return count;
}

/**
 * 获取敌方战区角色数
 * @param state 游戏状态
 * @param playerIdx 我方玩家 index
 * @returns 敌方战区角色总数
 */
export function opponentFieldCount(state: BattleState, playerIdx: number): number {
  return fieldCount(state, 1 - playerIdx);
}

/**
 * 获取我方某区域角色数
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @param zone 区域
 * @returns 该区域角色数
 */
export function zoneCount(state: BattleState, playerIdx: number, zone: Zone): number {
  return state.players[playerIdx].field[zone].length;
}

/**
 * 获取敌方某区域角色数
 * @param state 游戏状态
 * @param playerIdx 我方玩家 index
 * @param zone 区域
 * @returns 敌方该区域角色数
 */
export function opponentZoneCount(state: BattleState, playerIdx: number, zone: Zone): number {
  return state.players[1 - playerIdx].field[zone].length;
}

// ============================================================
// 撤退区/基地计数
// ============================================================

/**
 * 撤退区过滤条件
 */
export interface RetreatFilter {
  feature?: number;
  attribute?: number;
  maxLevel?: number;
  minLevel?: number;
}

/**
 * 获取撤退区卡数（可按特征/属性/等级过滤）
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @param filter 过滤条件（可选）
 * @returns 符合条件的撤退区卡数
 */
export function retreatCount(
  state: BattleState,
  playerIdx: number,
  db: CardDatabase,
  filter?: RetreatFilter
): number {
  const p = state.players[playerIdx];
  if (!filter) return p.retreat.length;

  return p.retreat.filter((id) => {
    const card = db.cards.find((c) => c.id === id);
    if (!card) return false;
    if (filter.feature && !hasFeature(card, filter.feature)) return false;
    if (filter.attribute && !hasAttribute(card, filter.attribute)) return false;
    if (filter.maxLevel !== undefined && card.cost > filter.maxLevel) return false;
    if (filter.minLevel !== undefined && card.cost < filter.minLevel) return false;
    return true;
  }).length;
}

/**
 * 获取基地盖卡数
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @returns 基地卡数
 */
export function baseFaceDownCount(state: BattleState, playerIdx: number): number {
  return state.players[playerIdx].baseCovered.length;
}

// ============================================================
// 卡牌属性查询
// ============================================================

/**
 * 获取卡牌 Lv（即 cost 值）
 * @param db 卡牌数据库
 * @param cardId 卡牌 ID
 * @returns Lv 值，未找到返回 0
 */
export function getCardLevel(db: CardDatabase, cardId: string): number {
  const card = db.cards.find((c) => c.id === cardId);
  return card?.cost ?? 0;
}

/**
 * 获取卡牌基础战力
 * @param db 卡牌数据库
 * @param cardId 卡牌 ID
 * @returns 战力数值，未找到返回 0
 */
export function getCardBasePower(db: CardDatabase, cardId: string): number {
  const card = db.cards.find((c) => c.id === cardId);
  if (!card || !card.power) return 0;
  const n = parseInt(card.power, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 获取卡牌基础 R 值（默认 1）
 * @param db 卡牌数据库
 * @param cardId 卡牌 ID
 * @returns R 值，未找到返回 1
 */
export function getCardBaseR(db: CardDatabase, cardId: string): number {
  const card = db.cards.find((c) => c.id === cardId);
  return card?.r ?? 1;
}

// ============================================================
// 结附查询
// ============================================================

/**
 * 检查卡牌是否有结附卡
 * @param state 游戏状态
 * @param cardId 宿主卡 ID
 * @returns 是否有结附卡
 */
export function hasAttachment(state: BattleState, cardId: string): boolean {
  const attachments = state.attachments[cardId];
  return !!attachments && attachments.length > 0;
}

/**
 * 获取卡牌的结附卡列表
 * @param state 游戏状态
 * @param cardId 宿主卡 ID
 * @returns 结附卡 ID 数组
 */
export function getAttachmentIds(state: BattleState, cardId: string): string[] {
  return state.attachments[cardId] ?? [];
}

/**
 * 获取敌方战区所有 Lv >= 指定值的角色卡
 * @param state 游戏状态
 * @param playerIdx 我方玩家 index
 * @param db 卡牌数据库
 * @param minLv 最低 Lv
 * @returns 符合条件的卡牌 { id, zone } 列表
 */
export function getOpponentFieldCardsWithMinLv(
  state: BattleState,
  playerIdx: number,
  db: CardDatabase,
  minLv: number
): { id: string; zone: Zone }[] {
  const result: { id: string; zone: Zone }[] = [];
  const opp = state.players[1 - playerIdx];
  for (const z of ZONE_LIST) {
    for (const id of opp.field[z]) {
      if (getCardLevel(db, id) >= minLv) {
        result.push({ id, zone: z });
      }
    }
  }
  return result;
}

/**
 * 获取敌方战区所有 Lv <= 指定值的角色卡
 * @param state 游戏状态
 * @param playerIdx 我方玩家 index
 * @param db 卡牌数据库
 * @param maxLv 最高 Lv
 * @returns 符合条件的卡牌 { id, zone } 列表
 */
export function getOpponentFieldCardsWithMaxLv(
  state: BattleState,
  playerIdx: number,
  db: CardDatabase,
  maxLv: number
): { id: string; zone: Zone }[] {
  const result: { id: string; zone: Zone }[] = [];
  const opp = state.players[1 - playerIdx];
  for (const z of ZONE_LIST) {
    for (const id of opp.field[z]) {
      if (getCardLevel(db, id) <= maxLv) {
        result.push({ id, zone: z });
      }
    }
  }
  return result;
}

/**
 * 获取我方战区所有符合特征的角色卡
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @param db 卡牌数据库
 * @param featureId 特征 ID
 * @returns 符合条件的卡牌 { id, zone } 列表
 */
export function getMyFieldCardsWithFeature(
  state: BattleState,
  playerIdx: number,
  db: CardDatabase,
  featureId: number
): { id: string; zone: Zone }[] {
  const result: { id: string; zone: Zone }[] = [];
  const p = state.players[playerIdx];
  for (const z of ZONE_LIST) {
    for (const id of p.field[z]) {
      const card = db.cards.find((c) => c.id === id);
      if (hasFeature(card, featureId)) {
        result.push({ id, zone: z });
      }
    }
  }
  return result;
}

// ============================================================
// T02 新增：场上卡牌查询与唯一性检查
// ============================================================

/**
 * 获取我方场上所有角色卡（不限特征）
 *
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @returns 我方场上所有角色卡的 { id, zone } 列表
 */
export function getMyFieldCards(
  state: BattleState,
  playerIdx: number
): { id: string; zone: Zone }[] {
  const result: { id: string; zone: Zone }[] = [];
  const p = state.players[playerIdx];
  for (const z of ZONE_LIST) {
    for (const id of p.field[z]) {
      result.push({ id, zone: z });
    }
  }
  return result;
}

/**
 * 检查我方场上是否已存在同名牌
 *
 * 用于【唯一】关键词的号召检查：若卡牌拥有【唯一】，
 * 我方场上不能存在其他同名称的卡牌。
 *
 * @param state 游戏状态
 * @param playerIdx 玩家 index
 * @param cardName 要检查的卡牌名称
 * @param db 卡牌数据库
 * @param excludeCardId 排除的卡牌 ID（可选，用于排除自身）
 * @returns 是否存在同名牌
 */
export function hasDuplicateName(
  state: BattleState,
  playerIdx: number,
  cardName: string,
  db: CardDatabase,
  excludeCardId?: string
): boolean {
  const fieldCards = getMyFieldCards(state, playerIdx);
  for (const { id } of fieldCards) {
    if (id === excludeCardId) continue;
    const card = db.cards.find((c) => c.id === id);
    if (card?.name === cardName) return true;
  }
  return false;
}
