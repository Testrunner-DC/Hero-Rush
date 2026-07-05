/**
 * 游戏引擎 — 引擎专用类型定义
 *
 * 包含 GameAction 联合类型、事件系统类型、能力系统类型。
 * 这些类型由 engine.ts / events.ts / abilities.ts 使用。
 */

import type { BattleState, Zone, TurnPhase, PlayerState } from "./state";
import type { CardDatabase, Card } from "../types/card";

// ============================================================
// AttackTarget — 攻击者选择信息
// ============================================================

/** 攻击者选择信息（confirmAttack 时从 state.pendingAttack 读取） */
export interface AttackTarget {
  attackerIdx: number;
  attackerZone: Zone;
  attackerCardId: string;
}

// ============================================================
// GameAction — 所有游戏命令的联合类型
// ============================================================

export type GameAction =
  /** 游戏初始化（GameSetup 完成后调用） */
  | { type: "SETUP_COMPLETE"; state: BattleState }
  /** 返回准备界面（游戏结束/重新开始） */
  | { type: "RESET_BATTLE" }
  /** 抽卡阶段：抽2张牌，推进到 ACTION */
  | { type: "DRAW_CARDS" }
  /** 推进到指定阶段 */
  | { type: "ADVANCE_PHASE"; next: TurnPhase }
  /** 结束回合：弃至9张，切换玩家 */
  | { type: "END_TURN" }
  /** 基地部署：手牌→基地，抽1张 */
  | { type: "DEPLOY_TO_BASE"; playerIdx: number; handIndex: number }
  /** 号召上场：手牌→战区/基地（含Lv4+撤退） */
  | { type: "SUMMON_TO_FIELD"; playerIdx: number; handIndex: number; zone: Zone | "base" }
  /** 战区移动：角色在区域间移动 */
  | { type: "MOVE_CHARACTER"; playerIdx: number; fromZone: Zone; cardId: string; toZone: Zone }
  /** 战基移动：角色在战区与基地之间移动 */
  | { type: "MOVE_CARD"; playerIdx: number; fromLoc: Zone | "base"; cardId: string; toLoc: Zone | "base" }
  /** 设置当前攻击区域（冲突阶段） */
  | { type: "SET_ATTACK_ZONE"; zone: Zone }
  /** 选择攻击者（设置 pendingAttack） */
  | { type: "START_ATTACK"; playerIdx: number; zone: Zone; cardId: string }
  /** 确认攻击目标，执行战斗判定 */
  | { type: "CONFIRM_ATTACK"; targetPlayerIdx: number; targetZone: Zone; targetCardId?: string }
  /** 跳过某区域 */
  | { type: "SKIP_ZONE"; zone: Zone }
  /** 进入攻击子阶段（从调整阶段切换） */
  | { type: "START_ATTACK_SUBPHASE" }
  /** 取消攻击者选择（清除 pendingAttack） */
  | { type: "CLEAR_ATTACK_TARGET" }
  /** 玩家选择撤退一张场上角色或基地盖卡（Lv4+号召时） */
  | { type: "SELECT_RETREAT"; cardId: string; loc: Zone | "base" }
  /** 取消号召，恢复到选择前状态 */
  | { type: "CANCEL_SUMMON" }
  // ===== T01 新增 GameAction（增量开发） =====
  /** 开局调度：抽起始手牌（设置 isSetup=true，进入 mulligan 阶段） */
  | { type: "SETUP_DRAW_HANDS"; state: BattleState }
  /** 开局调度：选择要调整的手牌（更新 mulliganSelected） */
  | { type: "MULLIGAN_SELECT"; playerIdx: number; cardIds: string[] }
  /** 开局调度：确认调整（放回卡组底 → 抽等量 → 洗混 → 进入下一玩家或开始游戏） */
  | { type: "MULLIGAN_CONFIRM"; playerIdx: number; shuffledDeck: string[] }
  /** 应对阶段：触发应对（使用手牌中【应对】角色进行号召） */
  | { type: "TRIGGER_COUNTER"; playerIdx: number; cardId: string; handIndex: number }
  /** 应对阶段：使用应对·起动效果（如拦截） */
  | { type: "RESOLVE_COUNTER"; playerIdx: number; effectCardId: string; effectId?: string }
  /** 应对阶段：选择不行动 */
  | { type: "PASS_COUNTER"; playerIdx: number }
  /** 起动效果：从手牌/基地/场上起动效果 */
  | { type: "ACTIVATE_EFFECT"; playerIdx: number; cardId: string; effectId?: string }
  // ===== Q7 新增 GameAction：目标选择 =====
  /** 玩家选择目标后确认 */
  | { type: "SELECT_TARGETS"; playerIdx: number; targetCardIds: string[] }
  /** 取消目标选择 */
  | { type: "CANCEL_TARGET_SELECTION"; playerIdx: number };

// ============================================================
// 事件系统类型
// ============================================================

/** 事件类型枚举 */
export type GameEventType =
  | "onTurnStart"
  | "onTurnEnd"
  | "onPhaseChange"
  | "onCardDrawn"
  | "onCardDeployed"
  | "onCardSummoned"
  | "onCardAttacked"
  | "onCardRetreated"
  | "onCardMoved"
  | "onTimelineAdded"
  | "onZoneCompleted"
  | "onStatChange"
  | "onAllyDefeated";

/** 事件触发时的上下文 */
export interface EventContext {
  state: BattleState;
  playerIdx?: number;
  cardId?: string;
  zone?: Zone;
  targetCardId?: string;
  [key: string]: unknown;
}

/** 事件监听器 */
export interface EventListener {
  /** 唯一标识 */
  id: string;
  /** 监听的事件类型 */
  eventType: GameEventType;
  /** 触发条件（可选，返回 true 才执行 handler） */
  condition?: (context: EventContext) => boolean;
  /** 事件处理器：接收上下文，返回更新后的状态 */
  handler: (context: EventContext) => BattleState;
  /** 是否只触发一次（触发后自动注销） */
  once?: boolean;
}

// ============================================================
// 能力系统类型
// ============================================================

/** 能力类型 */
export type AbilityType = "active" | "trigger" | "static";

/** 能力执行上下文 */
export interface AbilityContext {
  state: BattleState;
  /** 施放能力的卡牌 id */
  cardId: string;
  /** 施放者玩家 index */
  playerIdx: number;
  /** 选定的目标 */
  targets?: {
    cardId?: string;
    zone?: Zone;
    playerIdx?: number;
  };
}

/** 能力定义 */
export interface Ability {
  /** 唯一标识 */
  id: string;
  /** 来源卡牌 id */
  sourceCardId: string;
  /** 能力类型 */
  type: AbilityType;
  /** 显示名称（主动能力用） */
  label?: string;
  /** 费用检查（返回 true 表示可以支付） */
  cost?: (context: AbilityContext) => boolean;
  /** 触发条件（返回 true 才可执行） */
  condition?: (context: AbilityContext) => boolean;
  /** 效果执行：接收上下文，返回更新后的状态 */
  effect: (context: AbilityContext) => BattleState;
  /** 是否只能使用一次 */
  once?: boolean;
  /** 触发型能力的事件类型 */
  triggerEvent?: GameEventType;
}

// ============================================================
// CardLookup — 卡牌查找函数类型
// ============================================================

export type CardLookup = (id: string) => Card | undefined;
