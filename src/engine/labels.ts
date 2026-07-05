/**
 * 战区/阶段中文标签 —— 全项目唯一来源
 *
 * 引擎日志与 UI 显示共用这份文案。
 * 【所有权】文案措辞属 UI 事务，改动本文件请知会引擎负责人（日志断言可能依赖措辞）。
 */

import type { Zone, TurnPhase } from "./state";

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
