/**
 * ★ 引擎公共出口（barrel）—— UI 层唯一允许的引擎 import 入口
 *
 * 【所有权边界】
 * - src/engine/**   归「对战逻辑/卡效」负责人所有，内部结构随时可能重构
 * - UI 层（pages/components/hooks 等）只准 `import ... from "../engine"`，
 *   禁止深层引入 engine 内部文件（如 engine/effects/registry）
 * - UI 需要引擎新能力时：在这里加导出（新增选择器优先放 selectors.ts），
 *   而不是直接伸手进内部模块
 *
 * 唯一例外：engine/__tests__ 内部测试可以深层引入。
 */

// ===== 状态与命令类型 =====
export type {
  BattleState,
  PlayerState,
  Zone,
  TurnPhase,
  SetupPhase,
  PendingSummon,
  PendingCounter,
} from "./state";
export type { GameAction, AttackTarget } from "./types";

// ===== 核心 Reducer =====
export { createGameReducer } from "./engine";

// ===== 状态查询工具 =====
export {
  getCardPower,
  getEffectivePower,
  getEffectiveR,
  getAllFieldCards,
  findCardInField,
  getAttachments,
  canZoneAttack,
  hasKeyword,
} from "./cardUtils";
export { getActiveEffects } from "./effects";
export {
  getActivatableEffects,
  getKeywordCardNames,
  type ActivatableEffect,
} from "./selectors";

// ===== 开局准备 =====
export { getRushCardIds, deckEntriesToCardIds } from "./setup";

// ===== 中文标签（战区/阶段，全项目唯一来源） =====
export { ZONE_LIST, ZONE_LABELS, ZONE_SHORT, PHASE_LABELS } from "./labels";
