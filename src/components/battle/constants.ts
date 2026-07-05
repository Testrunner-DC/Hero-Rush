/**
 * 战场组件共享常量与类型
 *
 * 战区/阶段中文标签的唯一来源在 engine/labels.ts，此处仅转发。
 * ActionMode 是纯 UI 状态类型，归本文件所有。
 */

import type { Zone } from "../../engine";

/** 战区列表与中文标签 —— 转发自引擎（唯一来源：engine/labels.ts） */
export { ZONE_LIST, ZONE_LABELS, ZONE_SHORT, PHASE_LABELS } from "../../engine";

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
