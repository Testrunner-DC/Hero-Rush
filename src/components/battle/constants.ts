/**
 * 战场组件共享常量与类型
 *
 * 从 BattlePage.tsx 提取的常量和 ActionMode UI 状态类型。
 * 供 BattlePage 及各子组件共用。
 */

import type { Zone, TurnPhase } from "../../types/game";

/** 战区列表（按冲突阶段攻击顺序） */
export const ZONE_LIST: Zone[] = ["vanguard", "flankLeft", "flankRight", "rear"];

/** 战区中文标签 */
export const ZONE_LABELS: Record<Zone, string> = {
  vanguard: "先锋",
  flankLeft: "侧翼(左)",
  flankRight: "侧翼(右)",
  rear: "后卫",
};

/** 战区短标签（用于紧凑显示） */
export const ZONE_SHORT: Record<Zone, string> = {
  vanguard: "先锋",
  flankLeft: "左翼",
  flankRight: "右翼",
  rear: "后卫",
};

/** 回合阶段中文标签 */
export const PHASE_LABELS: Record<TurnPhase, string> = {
  TURN_START: "回合开始",
  DRAW: "抽卡阶段",
  ACTION: "行动阶段",
  CONFLICT: "冲突阶段",
  END_PHASE: "结束阶段",
};

/**
 * 行动菜单状态（UI 状态）
 *
 * - none: 无操作
 * - handSelect: 选中了一张手牌，等待玩家点击场上的位置按钮
 * - moveMenu: 选中了场上角色，显示移动目标选择菜单
 */
export type ActionMode =
  | { type: "none" }
  | { type: "handSelect"; playerIdx: number; handIndex: number }
  | { type: "moveMenu"; playerIdx: number; zone: Zone; cardId: string };
