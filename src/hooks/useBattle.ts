/**
 * ★ useBattle —— UI 与对战引擎之间的契约层（共管文件）
 *
 * 【所有权】本文件由「对战逻辑」与「UI」双方共管，改动前请互相知会。
 * - 引擎侧保证：只通过本 hook 暴露的 state / actions 与 UI 交互
 * - UI 侧保证：不绕过本 hook 直接 dispatch 引擎内部命令
 *   （GameSetup 的开局流程使用透出的 dispatch，是历史例外）
 *
 * 每个 action 内含 UI 层预校验（弹 alert 提示），校验不通过返回 false
 * 且不 dispatch；返回 true 表示命令已发出，UI 可据此重置选中菜单等状态。
 */

import { useReducer } from "react";
import type { Dispatch } from "react";
import type { CardDatabase } from "../types/card";
import {
  createGameReducer,
  canZoneAttack,
  ZONE_LIST,
  type BattleState,
  type GameAction,
  type TurnPhase,
  type Zone,
} from "../engine";

export interface BattleActions {
  /** 抽卡阶段：抽 2 张并进入行动阶段 */
  drawCards: () => void;
  /** 推进到指定阶段；有未完成号召时拦截 */
  advancePhase: (next: TurnPhase) => boolean;
  /** 结束回合换人；有未完成号召时拦截 */
  endTurn: () => boolean;
  /** 结束冲突阶段（跳到 END_PHASE） */
  endConflict: () => void;
  /** 部署手牌到基地（每回合 1 次、基地上限 6） */
  deployToBase: (playerIdx: number, handIndex: number) => boolean;
  /** 号召手牌到战区/基地（号召次数、区域占用、Lv4+ 撤退需求校验） */
  summonToField: (playerIdx: number, handIndex: number, zone: Zone | "base") => boolean;
  /** 战区之间移动角色 */
  moveCharacter: (playerIdx: number, fromZone: Zone, cardId: string, toZone: Zone) => boolean;
  /** 战基移动：战区与基地之间移动 */
  moveCard: (playerIdx: number, fromLoc: Zone | "base", cardId: string, toLoc: Zone | "base") => boolean;
  /** 冲突阶段：选择当前攻击战区 */
  setAttackZone: (zone: Zone) => void;
  /** 选定攻击者 */
  startAttack: (playerIdx: number, zone: Zone, cardId: string) => void;
  /** 确认攻击目标 */
  confirmAttack: (targetPlayerIdx: number, targetZone: Zone, targetCardId?: string) => void;
  /** 跳过某战区的攻击 */
  skipZone: (zone: Zone) => void;
  /** 冲突阶段：从调整子阶段进入攻击子阶段 */
  startAttackSubPhase: () => void;
  /** 取消当前攻击目标选择 */
  clearAttackTarget: () => void;
  /** 该战区当前是否可发起攻击 */
  canAttackZone: (zone: Zone) => boolean;
  /** 号召撤退选择：点选要撤退的角色 */
  selectRetreat: (cardId: string, loc: Zone | "base") => void;
  /** 取消当前号召 */
  cancelSummon: () => void;
  /** 应对窗口：pass */
  passCounter: (playerIdx: number) => void;
  /** 发动起动效果 */
  activateEffect: (playerIdx: number, cardId: string, effectId: string) => void;
  /** 目标选择：确认所选目标 */
  selectTargets: (playerIdx: number, targetCardIds: string[]) => void;
  /** 目标选择：取消 */
  cancelTargetSelection: (playerIdx: number) => void;
  /** 选发确认：发动挂起的可选效果 */
  confirmEffect: (playerIdx: number) => void;
  /** 选发确认：放弃发动 */
  declineEffect: (playerIdx: number) => void;
  /** 重置对战（返回大厅前调用） */
  resetBattle: () => void;
}

export interface UseBattleResult {
  /** 对战状态；null 表示尚未开局 */
  state: BattleState | null;
  /** 原始 dispatch —— 仅供 GameSetup 开局流程使用，对战中请走 actions */
  dispatch: Dispatch<GameAction>;
  actions: BattleActions;
}

export function useBattle(db: CardDatabase): UseBattleResult {
  const [state, dispatch] = useReducer(createGameReducer(db), null);

  const actions: BattleActions = {
    drawCards: () => {
      dispatch({ type: "DRAW_CARDS" });
    },

    advancePhase: (next) => {
      if (!state) return false;
      if (state.pendingSummon) {
        alert("请先完成或取消当前号召！");
        return false;
      }
      dispatch({ type: "ADVANCE_PHASE", next });
      return true;
    },

    endTurn: () => {
      if (!state) return false;
      if (state.pendingSummon) {
        alert("请先完成或取消当前号召！");
        return false;
      }
      dispatch({ type: "END_TURN" });
      return true;
    },

    endConflict: () => {
      dispatch({ type: "ADVANCE_PHASE", next: "END_PHASE" });
    },

    deployToBase: (playerIdx, handIndex) => {
      if (!state) return false;
      if (state.activePlayerIndex !== playerIdx || state.turnPhase !== "ACTION") return false;
      if (state.baseDeployedThisTurn) {
        alert("本回合已部署基地！每回合只能部署1次");
        return false;
      }
      const p = state.players[playerIdx];
      if (p.baseCards.length + p.baseCovered.length >= 6) {
        alert("基地区已满（上限6张）！");
        return false;
      }
      dispatch({ type: "DEPLOY_TO_BASE", playerIdx, handIndex });
      return true;
    },

    summonToField: (playerIdx, handIndex, zone) => {
      if (!state) return false;
      if (state.activePlayerIndex !== playerIdx || state.turnPhase !== "ACTION") return false;
      if (state.remainingSummons <= 0) {
        alert("号召次数已用完！");
        return false;
      }
      if (state.pendingSummon) return false;
      const p = state.players[playerIdx];
      if (zone !== "base" && p.field[zone].length >= 1) {
        alert("该区域已有角色！");
        return false;
      }
      if (zone === "base" && p.baseCards.length + p.baseCovered.length >= 6) {
        alert("基地区已满（上限6张）！");
        return false;
      }
      // Lv4+ 号召需要撤退场上角色 — 检查总Lv是否足够
      const cardId = p.hand[handIndex];
      const card = db.cards.find((c) => c.id === cardId);
      const lv = card?.cost ?? 0;
      if (lv >= 4) {
        let totalLv = 0;
        for (const z of ZONE_LIST) {
          for (const fid of p.field[z]) {
            const fc = db.cards.find((c) => c.id === fid);
            totalLv += fc?.cost ?? 1;
          }
        }
        for (const bid of [...p.baseCards, ...p.baseCovered]) {
          const bc = db.cards.find((c) => c.id === bid);
          totalLv += bc?.cost ?? 1;
        }
        if (totalLv < lv) {
          alert(`Lv${lv}角色需要撤退场上总Lv≥${lv}的角色！当前场上总Lv: ${totalLv}`);
          return false;
        }
      }
      dispatch({ type: "SUMMON_TO_FIELD", playerIdx, handIndex, zone });
      return true;
    },

    moveCharacter: (playerIdx, fromZone, cardId, toZone) => {
      if (!state || fromZone === toZone) return false;
      const isInAction = state.turnPhase === "ACTION" && state.activePlayerIndex === playerIdx;
      const isInConflictAdjust =
        state.turnPhase === "CONFLICT" &&
        state.conflictSubPhase === "adjust" &&
        state.activePlayerIndex === playerIdx;
      if (!isInAction && !isInConflictAdjust) return false;

      if (isInConflictAdjust && state.conflictMovesUsed >= 4) {
        alert("冲突阶段最多调整4次位置！");
        return false;
      }
      if (state.players[playerIdx].field[toZone].length >= 1) {
        alert("目标区域已有角色！");
        return false;
      }
      dispatch({ type: "MOVE_CHARACTER", playerIdx, fromZone, cardId, toZone });
      return true;
    },

    moveCard: (playerIdx, fromLoc, cardId, toLoc) => {
      if (!state || fromLoc === toLoc) return false;
      const isInAction = state.turnPhase === "ACTION" && state.activePlayerIndex === playerIdx;
      const isInConflictAdjust =
        state.turnPhase === "CONFLICT" &&
        state.conflictSubPhase === "adjust" &&
        state.activePlayerIndex === playerIdx;
      if (!isInAction && !isInConflictAdjust) return false;

      if (isInConflictAdjust && state.conflictMovesUsed >= 4) {
        alert("冲突阶段最多调整4次位置！");
        return false;
      }
      // 不能移动本回合进场的卡牌
      if (state.enteredThisTurn.includes(cardId)) {
        alert("本回合进场的卡牌不能进行移动！");
        return false;
      }
      // 不能移动正在被撤退选择的卡牌
      if (state.pendingSummon?.selectedRetreatIds.includes(cardId)) {
        alert("该卡牌正在被撤退选择中，不能移动！");
        return false;
      }
      // 目标位置有空位
      if (toLoc === "base") {
        const p = state.players[playerIdx];
        if (p.baseCards.length + p.baseCovered.length >= 6) {
          alert("基地区已满（上限6张）！");
          return false;
        }
      } else {
        if (state.players[playerIdx].field[toLoc].length >= 1) {
          alert("目标区域已有角色！");
          return false;
        }
      }
      dispatch({ type: "MOVE_CARD", playerIdx, fromLoc, cardId, toLoc });
      return true;
    },

    setAttackZone: (zone) => {
      dispatch({ type: "SET_ATTACK_ZONE", zone });
    },

    startAttack: (playerIdx, zone, cardId) => {
      dispatch({ type: "START_ATTACK", playerIdx, zone, cardId });
    },

    confirmAttack: (targetPlayerIdx, targetZone, targetCardId) => {
      dispatch({ type: "CONFIRM_ATTACK", targetPlayerIdx, targetZone, targetCardId });
    },

    skipZone: (zone) => {
      dispatch({ type: "SKIP_ZONE", zone });
    },

    startAttackSubPhase: () => {
      dispatch({ type: "START_ATTACK_SUBPHASE" });
    },

    clearAttackTarget: () => {
      dispatch({ type: "CLEAR_ATTACK_TARGET" });
    },

    canAttackZone: (zone) => (state ? canZoneAttack(state, zone) : false),

    selectRetreat: (cardId, loc) => {
      dispatch({ type: "SELECT_RETREAT", cardId, loc });
    },

    cancelSummon: () => {
      dispatch({ type: "CANCEL_SUMMON" });
    },

    passCounter: (playerIdx) => {
      dispatch({ type: "PASS_COUNTER", playerIdx });
    },

    activateEffect: (playerIdx, cardId, effectId) => {
      dispatch({ type: "ACTIVATE_EFFECT", playerIdx, cardId, effectId });
    },

    selectTargets: (playerIdx, targetCardIds) => {
      dispatch({ type: "SELECT_TARGETS", playerIdx, targetCardIds });
    },

    cancelTargetSelection: (playerIdx) => {
      dispatch({ type: "CANCEL_TARGET_SELECTION", playerIdx });
    },

    confirmEffect: (playerIdx) => {
      dispatch({ type: "CONFIRM_EFFECT", playerIdx });
    },

    declineEffect: (playerIdx) => {
      dispatch({ type: "DECLINE_EFFECT", playerIdx });
    },

    resetBattle: () => {
      dispatch({ type: "RESET_BATTLE" });
    },
  };

  return { state, dispatch, actions };
}
