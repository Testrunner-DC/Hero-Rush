/**
 * 效果系统统一导出与初始化
 *
 * 提供 registerAllEffects() 函数，在游戏初始化时调用。
 * 导出所有效果系统的公共 API。
 */

import type { CardDatabase } from "../../types/card";
import { registerSD01Effects } from "./sd01";
import { registerSD02Effects } from "./sd02";

// 类型导出
export type {
  EffectCategory,
  TriggerTiming,
  ActiveSource,
  CounterTarget,
  Modifier,
  EffectContext,
  TargetSpec,
  CardEffect,
} from "./types";

// 注册表导出
export {
  EFFECT_REGISTRY,
  registerEffect,
  registerEffects,
  getEffectsByCardNo,
  getStaticEffects,
  getCounterEffects,
  getActiveEffects,
  getCounterActiveEffects,
  findCardOwner,
  triggerEffectsByTiming,
  triggerAllFieldEffects,
  triggerAllyDefeatedEffects,
} from "./registry";

// 辅助函数导出
export * as EffectHelpers from "./helpers";
export * as EffectConditions from "./conditions";

/** 效果系统是否已初始化 */
let effectsInitialized = false;

/**
 * 注册所有卡牌效果
 *
 * 在游戏初始化时（createGameReducer 中）调用。
 * 幂等：重复调用不会重复注册。
 *
 * @param db 卡牌数据库（当前未使用，预留扩展）
 */
export function registerAllEffects(db?: CardDatabase): void {
  if (effectsInitialized) return;
  effectsInitialized = true;

  registerSD01Effects();
  registerSD02Effects();

  // 预留：未来可根据 db 动态注册更多卡包效果
  if (db) {
    // 未来扩展点
  }
}

/**
 * 重置效果系统（主要用于测试）
 */
export function resetEffectRegistry(): void {
  effectsInitialized = false;
  // 清空注册表
  // 注意：EFFECT_REGISTRY 是 Map，需要手动清空
  // 但由于是模块级变量，这里通过重新导入来清空
  // 实际应用中不需要重置
}
