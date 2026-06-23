/**
 * 效果系统核心类型定义
 *
 * 包含 CardEffect、EffectContext、Modifier、TargetSpec 等核心接口。
 * 被 registry.ts、helpers.ts、conditions.ts、sd01.ts、sd02.ts 使用。
 */

import type { BattleState, Zone } from "../../types/game";
import type { CardDatabase } from "../../types/card";

// ============================================================
// Modifier — 临时修改器（定义在 game.ts 中，此处 re-export）
// ============================================================

/**
 * 临时修改器接口
 *
 * 用于追踪战力/R值/费用的临时修改。
 * duration="turn" 的修改器在回合结束时清除。
 * duration="permanent" 的修改器在来源卡牌撤退/解除时移除。
 */
export interface Modifier {
  /** 唯一标识 */
  id: string;
  /** 被修改的卡牌 ID */
  targetCardId: string;
  /** 修改类型 */
  type: "power" | "r" | "cost";
  /** 修改值（正数为增加，负数为减少） */
  value: number;
  /** 持续时间 */
  duration: "turn" | "permanent";
  /** 来源卡牌 ID（用于解除） */
  sourceCardId: string;
}

// ============================================================
// 效果分类与触发时机
// ============================================================

/** 效果分类 */
export type EffectCategory = "trigger" | "static" | "active" | "counter";

/** 触发时机 */
export type TriggerTiming =
  | "onSummon"
  | "onRetreat"
  | "onAttack"
  | "onAttached"
  | "onStatChange"
  | "onAllyDefeated"
  | "onTurnStart"
  | "onTurnEnd";

/** 起动效果来源区域 */
export type ActiveSource = "hand" | "base" | "field";

/** 应对目标 */
export type CounterTarget = "summon" | "attack";

// ============================================================
// EffectContext — 效果执行上下文
// ============================================================

/** 效果执行上下文 */
export interface EffectContext {
  state: BattleState;
  /** 效果来源卡牌 ID */
  cardId: string;
  /** 施放者玩家 index */
  playerIdx: number;
  /** 卡牌数据库 */
  db: CardDatabase;
  /** 选定的目标 */
  targets?: {
    cardId?: string;
    zone?: Zone;
    playerIdx?: number;
    cardIds?: string[];
  };
  /** 触发信息（触发型效果时填充） */
  triggerInfo?: {
    event: TriggerTiming;
    sourceCardId?: string;
    sourcePlayerIdx?: number;
  };
}

// ============================================================
// TargetSpec — 目标选择规格
// ============================================================

/** 目标选择规格（UI 层用于提示玩家选目标） */
export interface TargetSpec {
  /** 目标数量 */
  count: number;
  /** 目标区域 */
  zone: "myField" | "opponentField" | "myBase" | "myRetreat" | "myHand" | "opponentVanguard";
  /** 过滤条件 */
  filter?: {
    maxLevel?: number;
    minLevel?: number;
    feature?: number;
    attribute?: number;
  };
  /** 是否可选 */
  optional?: boolean;
}

// ============================================================
// CardEffect — 卡牌效果定义
// ============================================================

/** 卡牌效果定义 */
export interface CardEffect {
  /** 唯一标识：`${cardNo}-${effectIndex}` */
  id: string;
  /** 关联卡牌 card_no */
  cardNo: string;
  /** 效果分类 */
  category: EffectCategory;

  // --- 触发型效果 ---
  trigger?: TriggerTiming;
  /** 触发条件（可选） */
  triggerCondition?: (ctx: EffectContext) => boolean;

  // --- 起动型效果 ---
  activeSource?: ActiveSource;
  /** 是否需要盖伏此卡作为执行后结果 */
  faceDownAfterActive?: boolean;

  // --- 应对型效果 ---
  counterTarget?: CounterTarget;

  // --- 通用 ---
  /** 费用检查（返回 true 表示可支付，副作用在 execute 中扣费） */
  cost?: (ctx: EffectContext) => boolean;
  /** 执行条件 */
  condition?: (ctx: EffectContext) => boolean;
  /** 效果执行 */
  execute: (ctx: EffectContext) => BattleState;
  /** 常驻修改器计算（仅 static 类型） */
  staticModifier?: (ctx: EffectContext) => Modifier | null;
  /** 目标选择规格 */
  targetSpec?: TargetSpec;
  /** 是否一次性效果 */
  once?: boolean;
  /** 显示名称 */
  label?: string;

  // ===== T01 新增字段（增量开发） =====

  /** 是否为应对·起动效果（区别于普通 active，如 SD01-002/016） */
  isCounterActive?: boolean;

  /** 是否拥有【唯一】关键词（号召时检查同名牌） */
  isUnique?: boolean;

  /** 常驻关键词能力列表（如 ["combo"] 表示拥有连击） */
  keywords?: string[];
}
