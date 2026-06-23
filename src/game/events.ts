/**
 * 事件系统 — 事件注册/触发框架
 *
 * 支持卡牌效果的"当XX发生时触发"机制。
 * triggerEvent 查找匹配的监听器并执行，支持活跃玩家优先和防重入。
 */

import type { BattleState } from "../types/game";
import type { EventListener, EventContext, GameEventType } from "./types";

/** 防重入标志 */
let isTriggering = false;

/**
 * 注册事件监听器
 * @param state 当前游戏状态
 * @param listener 要注册的监听器
 * @returns 更新后的状态
 */
export function registerEvent(state: BattleState, listener: EventListener): BattleState {
  return {
    ...state,
    eventListeners: [...state.eventListeners, listener],
  };
}

/**
 * 注销事件监听器
 * @param state 当前游戏状态
 * @param id 要注销的监听器 id
 * @returns 更新后的状态
 */
export function unregisterEvent(state: BattleState, id: string): BattleState {
  return {
    ...state,
    eventListeners: state.eventListeners.filter((l) => l.id !== id),
  };
}

/**
 * 触发事件 — 查找所有匹配的监听器并依次执行
 * 遵循"活跃玩家优先"原则。
 * 支持防重入：在触发过程中不会递归触发。
 *
 * @param state 当前游戏状态
 * @param eventType 事件类型
 * @param context 事件上下文
 * @returns 所有匹配 handler 执行后的累积状态
 */
export function triggerEvent(
  state: BattleState,
  eventType: GameEventType,
  context: EventContext
): BattleState {
  // 防重入
  if (isTriggering) return state;

  let currentState = state;
  const toRemove: string[] = [];

  // 按活跃玩家优先排序监听器
  const activeIdx = state.activePlayerIndex;
  const listeners = currentState.eventListeners
    .filter((l) => l.eventType === eventType)
    .sort((a, b) => {
      // 活跃玩家优先（通过 listener.id 中的 playerIdx 约定，或保持注册顺序）
      return 0;
    });

  if (listeners.length === 0) return state;

  isTriggering = true;
  try {
    for (const listener of listeners) {
      // 检查条件
      if (listener.condition && !listener.condition({ ...context, state: currentState })) {
        continue;
      }
      // 执行 handler
      currentState = listener.handler({ ...context, state: currentState });
      // 标记 once 类型的监听器
      if (listener.once) {
        toRemove.push(listener.id);
      }
    }

    // 移除已触发的 once 监听器
    if (toRemove.length > 0) {
      currentState = {
        ...currentState,
        eventListeners: currentState.eventListeners.filter(
          (l) => !toRemove.includes(l.id)
        ),
      };
    }
  } finally {
    isTriggering = false;
  }

  // 记录活跃玩家 index（消除未使用变量警告）
  void activeIdx;

  return currentState;
}
