/**
 * 核心游戏引擎 — Command-Reducer-Checkpoint 三层模式
 *
 * UI 事件 ──→ dispatch(GameAction) ──→ gameReducer ──→ checkpoint ──→ 新 BattleState
 *
 * gameReducer 是纯函数：相同输入永远产生相同输出，无副作用。
 * CardDatabase 通过 createGameReducer(db) 柯里化注入。
 */

import type { BattleState, Zone, TurnPhase, SetupPhase } from "../types/game";
import type { CardDatabase } from "../types/card";
import type { GameAction } from "./types";
import type { EffectContext } from "./effects";
import { getCardPower, getEffectivePower, cleanupTurnModifiers, hasKeyword } from "./cardUtils";
import { triggerEvent } from "./events";
import { registerAllEffects, triggerEffectsByTiming, triggerAllFieldEffects, triggerAllyDefeatedEffects, getEffectsByCardNo, findCardOwner } from "./effects";

// ============================================================
// 常量
// ============================================================

const ZONE_LIST: Zone[] = ["vanguard", "flankLeft", "flankRight", "rear"];

const ZONE_LABELS: Record<Zone, string> = {
  vanguard: "先锋",
  flankLeft: "侧翼(左)",
  flankRight: "侧翼(右)",
  rear: "后卫",
};

const PHASE_LABELS: Record<TurnPhase, string> = {
  TURN_START: "回合开始",
  DRAW: "抽卡阶段",
  ACTION: "行动阶段",
  CONFLICT: "冲突阶段",
  END_PHASE: "结束阶段",
};
// ============================================================
// 胜负检查
// ============================================================

/**
 * 检查胜负条件
 * - timeline.length >= 9 → 对方胜
 * - deck.length === 0 → 对方胜
 *
 * @param state 当前游戏状态
 * @returns 更新后的状态（若触发胜负则设置 isGameOver）
 */
function checkGameOver(state: BattleState): BattleState {
  for (let i = 0; i < 2; i++) {
    const p = state.players[i];
    if (p.timeline.length >= 9) {
      return {
        ...state,
        isGameOver: true,
        winner: 1 - i,
        turnPhase: "END_PHASE",
        log: [
          ...state.log,
          `🏆 ${p.name} 的时间线已满9张！${state.players[1 - i].name} 获胜！`,
        ],
      };
    }
    if (p.deck.length === 0) {
      return {
        ...state,
        isGameOver: true,
        winner: 1 - i,
        turnPhase: "END_PHASE",
        log: [
          ...state.log,
          `🏆 ${p.name} 的卡组已空！${state.players[1 - i].name} 获胜！`,
        ],
      };
    }
  }
  return state;
}

/**
 * Checkpoint — 每次 action 处理后自动运行
 *
 * Step 1: 检查胜负条件
 * Step 2: 触发待处理事件（当前 no-op，eventListeners 为空数组）
 * Step 3: 清理过期状态（当前无持续效果，预留）
 *
 * @param state 处理后的游戏状态
 * @returns 最终状态
 */
function checkpoint(state: BattleState): BattleState {
  // Step 1: 检查胜负条件
  state = checkGameOver(state);
  if (state.isGameOver) return state;

  // Step 2: 触发待处理事件（当前无卡牌效果，eventListeners 为空数组）
  // 未来卡牌效果注册的 listener 会在此被触发
  // state = triggerEvent(state, "onPhaseChange", { state });

  // Step 3: 清理过期状态（当前无持续效果，预留）
  // state = cleanupExpiredEffects(state);

  return state;
}

// ============================================================
// createGameReducer — 柯里化工厂函数
// ============================================================

/**
 * 创建游戏 reducer 的工厂函数
 *
 * React 的 useReducer 只支持 (state, action) => state 签名，
 * 无法传入额外参数。使用工厂函数通过闭包注入 CardDatabase。
 *
 * @param db 卡牌数据库
 * @returns gameReducer 函数
 */
export function createGameReducer(db: CardDatabase) {
  // 初始化效果系统（注册所有卡牌效果）
  registerAllEffects(db);

  /**
   * 游戏核心 reducer — 纯函数，处理所有 GameAction
   *
   * @param state 当前游戏状态（null 表示未开始游戏）
   * @param action 游戏命令
   * @returns 新的游戏状态
   */
  return function gameReducer(
    state: BattleState | null,
    action: GameAction
  ): BattleState | null {
    // ===== 不需要 state 的 action =====
    if (action.type === "SETUP_COMPLETE") {
      return action.state;
    }
    if (action.type === "SETUP_DRAW_HANDS") {
      return action.state;
    }
    if (action.type === "RESET_BATTLE") {
      return null;
    }

    // ===== 其他 action 需要 state =====
    if (!state) return state;

    switch (action.type) {
      case "DRAW_CARDS":
        return handleDrawCards(state);
      case "ADVANCE_PHASE":
        return handleAdvancePhase(state, action.next);
      case "END_TURN":
        return handleEndTurn(state);
      case "DEPLOY_TO_BASE":
        return handleDeployToBase(state, action.playerIdx, action.handIndex);
      case "SUMMON_TO_FIELD":
        return handleSummonToField(state, action.playerIdx, action.handIndex, action.zone);
      case "MOVE_CHARACTER":
        return handleMoveCharacter(
          state,
          action.playerIdx,
          action.fromZone,
          action.cardId,
          action.toZone
        );
      case "MOVE_CARD":
        return handleMoveCard(
          state,
          action.playerIdx,
          action.fromLoc,
          action.cardId,
          action.toLoc
        );
      case "SET_ATTACK_ZONE":
        return checkpoint({
          ...state,
          currentAttackZone: action.zone,
          pendingAttack: null,
        });
      case "START_ATTACK":
        return handleStartAttack(state, action.playerIdx, action.zone, action.cardId);
      case "CONFIRM_ATTACK":
        return handleConfirmAttack(
          state,
          action.targetPlayerIdx,
          action.targetZone,
          action.targetCardId
        );
      case "SKIP_ZONE":
        return handleSkipZone(state, action.zone);
      case "START_ATTACK_SUBPHASE":
        return checkpoint({
          ...state,
          conflictSubPhase: "attack",
          pendingAttack: null,
          currentAttackZone: null,
        });
      case "CLEAR_ATTACK_TARGET":
        return checkpoint({ ...state, pendingAttack: null });
      case "SELECT_RETREAT":
        return handleSelectRetreat(state, action.cardId, action.loc);
      case "CANCEL_SUMMON":
        return handleCancelSummon(state);
      case "MULLIGAN_SELECT":
        return handleMulliganSelect(state, action.playerIdx, action.cardIds);
      case "MULLIGAN_CONFIRM":
        return handleMulliganConfirm(state, action.playerIdx, action.shuffledDeck);
      case "TRIGGER_COUNTER":
        return handleTriggerCounter(state, action.playerIdx, action.cardId, action.handIndex);
      case "RESOLVE_COUNTER":
        return handleResolveCounter(state, action.playerIdx, action.effectCardId, action.effectId);
      case "PASS_COUNTER":
        return handlePassCounter(state, action.playerIdx);
      case "ACTIVATE_EFFECT":
        return handleActivateEffect(state, action.playerIdx, action.cardId, action.effectId);
      case "SELECT_TARGETS":
        return handleSelectTargets(state, action.playerIdx, action.targetCardIds);
      case "CANCEL_TARGET_SELECTION":
        return handleCancelTargetSelection(state, action.playerIdx);
      default:
        return state;
    }
  };

  // ============================================================
  // Action 处理函数（闭包内可访问 db）
  // ============================================================

  /**
   * DRAW_CARDS — 抽卡阶段
   * 活跃玩家抽 min(2, deck.length) 张；若 deck=0 → 判负；推进到 ACTION
   */
  function handleDrawCards(state: BattleState): BattleState {
    const idx = state.activePlayerIndex;
    const p = state.players[idx];
    const deck = [...p.deck];
    const drawCount = Math.min(2, deck.length);

    if (drawCount === 0) {
      return checkpoint({
        ...state,
        isGameOver: true,
        winner: 1 - idx,
        turnPhase: "END_PHASE",
        log: [
          ...state.log,
          `💀 ${p.name} 的卡组已空，无法抽牌！${state.players[1 - idx].name} 获胜！`,
        ],
      });
    }

    const drawn = deck.splice(0, drawCount);
    const hand = [...p.hand, ...drawn];
    const np = [...state.players] as typeof state.players;
    np[idx] = { ...p, deck, hand };

    const newState: BattleState = {
      ...state,
      players: np,
      turnPhase: "ACTION",
      log: [
        ...state.log,
        `📥 ${p.name} 抽牌 +${drawn.length} (手牌:${hand.length},卡组剩余:${deck.length})`,
      ],
    };

    return checkpoint(newState);
  }

  /**
   * ADVANCE_PHASE — 推进到指定阶段
   * 先攻首回跳过 CONFLICT→END_PHASE；进入 CONFLICT 时初始化冲突状态
   */
  function handleAdvancePhase(state: BattleState, next: TurnPhase): BattleState {
    let log = [...state.log, `➡️ 进入${PHASE_LABELS[next]}`];
    let newState: BattleState = { ...state, turnPhase: next, log };

    // 先攻首回合跳过冲突阶段
    if (
      next === "CONFLICT" &&
      state.turnNumber === 1 &&
      state.players[state.activePlayerIndex].isFirstPlayer
    ) {
      log = [...log, "⏭️ 先攻首回合跳过冲突阶段"];
      newState = { ...state, turnPhase: "END_PHASE", log };
    }

    // 进入冲突阶段 → 初始化冲突状态
    if (newState.turnPhase === "CONFLICT") {
      newState = {
        ...newState,
        conflictZonesCompleted: [],
        conflictAttackedCards: [],
        conflictAttackCount: {},
        conflictSubPhase: "adjust",
        conflictMovesUsed: 0,
        currentAttackZone: null,
        pendingAttack: null,
        pendingSummon: null,
        pendingCounter: null,
      };
    }

    // 触发阶段变更事件
    newState = triggerEvent(newState, "onPhaseChange", {
      state: newState,
      playerIdx: newState.activePlayerIndex,
    });

    return checkpoint(newState);
  }

  /**
   * END_TURN — 结束回合
   * 弃至9张；切换玩家；回合数+1（回到P0时）；重置所有回合计数器；设 TURN_START
   */
  function handleEndTurn(state: BattleState): BattleState {
    const nextIdx = state.activePlayerIndex === 0 ? 1 : 0;
    const nextTurn = nextIdx === 0 ? state.turnNumber + 1 : state.turnNumber;
    const isFirstTurn = nextTurn === 1 && state.players[nextIdx].isFirstPlayer;
    const np = [...state.players] as typeof state.players;

    // 结束阶段：手牌弃至9张
    const p = state.players[state.activePlayerIndex];
    let hand = [...p.hand];
    let discard = 0;
    if (hand.length > 9) {
      discard = hand.length - 9;
      hand = hand.slice(0, 9);
    }
    np[state.activePlayerIndex] = { ...p, hand };

    let logs: string[] = [`⏹️ ${p.name} 回合结束`];
    if (discard > 0) logs.push(`🗑️ 手牌弃至9张(-${discard})`);

    let newState: BattleState = {
      ...state,
      players: np,
      log: [...state.log, ...logs],
    };

    // ===== 1. 触发当前玩家的 onTurnEnd 效果 =====
    newState = triggerAllFieldEffects(newState, "onTurnEnd", db, state.activePlayerIndex);

    // ===== 2. 清除 turn 持续时间的修改器 =====
    newState = cleanupTurnModifiers(newState);

    logs.push(`━━━ 第${nextTurn}回合：${np[nextIdx].name}的回合 ━━━`);

    // ===== 3. 切换玩家，重置回合计数器 =====
    newState = {
      ...newState,
      activePlayerIndex: nextIdx,
      turnNumber: nextTurn,
      turnPhase: "TURN_START",
      remainingSummons: isFirstTurn ? 1 : 3,
      baseDeployedThisTurn: false,
      baseMovesUsed: {},
      enteredThisTurn: [],
      conflictZonesCompleted: [],
      conflictAttackedCards: [],
      conflictAttackCount: {},
      conflictSubPhase: "adjust",
      conflictMovesUsed: 0,
      currentAttackZone: null,
      pendingAttack: null,
      pendingSummon: null,
      pendingCounter: null,
      counterUsedThisTurn: [false, false] as [boolean, boolean],
      counterPassCount: 0,
      temporaryAbilities: {},
      interceptUsedThisTurn: [],
      effectUsedThisTurn: [],
      activatedEffectsThisTurn: [],
      log: [...newState.log, ...logs],
    };

    // ===== 4. 触发新玩家的 onTurnStart 效果 =====
    newState = triggerAllFieldEffects(newState, "onTurnStart", db, nextIdx);

    return checkpoint(newState);
  }

  /**
   * DEPLOY_TO_BASE — 基地部署
   * 验证活跃玩家+ACTION+未部署+基地<6；手牌→基地；抽1张（卡组为0跳过）；设 baseDeployedThisTurn=true
   */
  function handleDeployToBase(
    state: BattleState,
    playerIdx: number,
    handIndex: number
  ): BattleState {
    // 验证：活跃玩家 + ACTION 阶段 + 未部署 + 基地<6
    if (state.activePlayerIndex !== playerIdx || state.turnPhase !== "ACTION") return state;
    if (state.baseDeployedThisTurn) return state;
    if (state.players[playerIdx].base.length >= 6) return state;

    const np = [...state.players] as typeof state.players;
    const p = { ...np[playerIdx] };
    const hand = [...p.hand];
    const cardId = hand.splice(handIndex, 1)[0];
    const card = db.cards.find((c) => c.id === cardId);
    const base = [...p.base, cardId];

    // 从卡组抽1张牌
    const deck = [...p.deck];
    let drawMsg = "";
    if (deck.length > 0) {
      const drawnId = deck.shift()!;
      hand.push(drawnId);
      drawMsg = " → 抽1张牌";
    }

    np[playerIdx] = { ...p, hand, base, deck };

    let newState: BattleState = {
      ...state,
      players: np,
      baseDeployedThisTurn: true,
      enteredThisTurn: [...state.enteredThisTurn, cardId],
      log: [
        ...state.log,
        `🏚️ ${p.name} 将「${card?.name || "?"}」盖放进基地 (${base.length}/6)${drawMsg}`,
      ],
    };

    // 触发基地部署事件
    newState = triggerEvent(newState, "onCardDeployed", {
      state: newState,
      cardId,
      playerIdx,
    });

    return checkpoint(newState);
  }

  /**
   * SUMMON_TO_FIELD — 号召上场
   *
   * 验证活跃玩家+ACTION+号召次数>0+区域容量；
   * Lv4+ 不再自动贪心撤退，而是设置 pendingSummon 状态等待玩家手动选择撤退目标；
   * Lv1-3 直接号召上场（移除手牌→放入目标区域）；remainingSummons-1
   */
  function handleSummonToField(
    state: BattleState,
    playerIdx: number,
    handIndex: number,
    zone: Zone | "base"
  ): BattleState {
    // 验证：活跃玩家 + ACTION 阶段 + 号召次数>0 + 无 pendingSummon
    if (state.activePlayerIndex !== playerIdx || state.turnPhase !== "ACTION") return state;
    if (state.remainingSummons <= 0) return state;
    if (state.pendingSummon) return state;

    const p = state.players[playerIdx];
    const cardId = p.hand[handIndex];
    if (!cardId) return state;
    const card = db.cards.find((c) => c.id === cardId);
    const lv = card?.cost ?? 0;

    // 检查战区容量（每区域限1张）
    if (zone !== "base" && p.field[zone].length >= 1) return state;
    // 检查基地容量
    if (zone === "base" && p.base.length >= 6) return state;

    // 唯一性检查：若卡牌拥有【唯一】关键词，我方场上不能存在同名牌
    if (zone !== "base" && card) {
      const cardEffects = getEffectsByCardNo(card.card_no);
      const isUnique = cardEffects.some((e) => e.isUnique === true);
      if (isUnique) {
        for (const z of ZONE_LIST) {
          for (const fieldCardId of p.field[z]) {
            const fieldCard = db.cards.find((c) => c.id === fieldCardId);
            if (fieldCard?.name === card.name) {
              return {
                ...state,
                log: [
                  ...state.log,
                  `❌ 「${card.name}」拥有【唯一】，我方场上已存在同名牌，无法号召`,
                ],
              };
            }
          }
        }
      }
    }

    if (lv >= 4) {
      // ===== Lv4+ 号召：检查总Lv是否足够，然后设置 pendingSummon =====
      const fieldChars: { id: string; loc: Zone | "base"; lv: number }[] = [];
      for (const z of ZONE_LIST) {
        for (const fid of p.field[z]) {
          const fc = db.cards.find((c) => c.id === fid);
          fieldChars.push({ id: fid, loc: z, lv: fc?.cost ?? 1 });
        }
      }
      for (const bid of p.base) {
        const bc = db.cards.find((c) => c.id === bid);
        fieldChars.push({ id: bid, loc: "base", lv: bc?.cost ?? 1 });
      }
      const totalLv = fieldChars.reduce((s, c) => s + c.lv, 0);
      if (totalLv < lv) return state;

      // 设置 pendingSummon — 不从手牌移除，等待玩家选择撤退目标
      return {
        ...state,
        pendingSummon: {
          playerIdx,
          handIndex,
          zone,
          cardId,
          requiredLv: lv,
          selectedRetreatIds: [],
          selectedLv: 0,
        },
        log: [
          ...state.log,
          `⏳ ${p.name} 开始号召「${card?.name || "?"}」(Lv${lv})，请选择撤退角色 (需撤退Lv≥${lv})`,
        ],
      };
    }

    // ===== Lv1-3 直接号召上场 =====
    const np = [...state.players] as typeof state.players;
    const npP = { ...np[playerIdx] };
    const hand = [...npP.hand];
    hand.splice(handIndex, 1);

    if (zone === "base") {
      np[playerIdx] = { ...npP, hand, base: [...npP.base, cardId] };
    } else {
      np[playerIdx] = {
        ...npP,
        hand,
        field: { ...npP.field, [zone]: [...npP.field[zone], cardId] },
      };
    }

    const zoneLabel = zone === "base" ? "基地" : ZONE_LABELS[zone];
    let newState: BattleState = {
      ...state,
      players: np,
      remainingSummons: state.remainingSummons - 1,
      enteredThisTurn: [...state.enteredThisTurn, cardId],
      log: [
        ...state.log,
        `⚔️ ${p.name} 号召「${card?.name || "?"}」(Lv${lv}) → ${zoneLabel} [剩余${state.remainingSummons - 1}次]`,
      ],
    };

    // 触发号召进场事件
    newState = triggerEvent(newState, "onCardSummoned", {
      state: newState,
      cardId,
      playerIdx,
      zone: zone === "base" ? undefined : zone,
    });

    // 触发该卡牌的 onSummon 效果
    if (zone !== "base") {
      newState = triggerEffectsByTiming(newState, cardId, "onSummon", db);
    }

    // 号召完成后开启应对窗口（仅战区号召）
    if (zone !== "base") {
      newState = {
        ...newState,
        pendingCounter: {
          summoningPlayerIdx: playerIdx,
          summoningCardId: cardId,
          summoningZone: zone,
        },
        counterPassCount: 0,
      };
    }

    return checkpoint(newState);
  }

  /**
   * SELECT_RETREAT — 玩家选择撤退一张场上角色或基地盖卡
   *
   * 将选中卡牌加入 selectedRetreatIds，累加 selectedLv。
   * 当 selectedLv >= requiredLv 时完成号召：
   *   - 撤退所有选中的卡牌（移入 retreat 区）
   *   - 将号召卡牌从手牌移至目标区域
   *   - 清除 pendingSummon，remainingSummons-1
   */
  function handleSelectRetreat(
    state: BattleState,
    cardId: string,
    loc: Zone | "base"
  ): BattleState {
    if (!state.pendingSummon) return state;
    const ps = state.pendingSummon;

    // 不能重复选择同一张卡
    if (ps.selectedRetreatIds.includes(cardId)) return state;

    const p = state.players[ps.playerIdx];
    let cardLv = 0;

    // 验证卡牌位置并获取 Lv
    if (loc === "base") {
      if (!p.base.includes(cardId)) return state;
      // Bug 2 修正：基地卡按实际 Lv 计算（不再硬编码为1）
      const baseCard = db.cards.find((c) => c.id === cardId);
      cardLv = baseCard?.cost ?? 1;
    } else {
      if (!p.field[loc].includes(cardId)) return state;
      const fc = db.cards.find((c) => c.id === cardId);
      cardLv = fc?.cost ?? 1;
    }

    const newSelectedIds = [...ps.selectedRetreatIds, cardId];
    const newSelectedLv = ps.selectedLv + cardLv;

    // 如果还不够，仅更新 pendingSummon
    if (newSelectedLv < ps.requiredLv) {
      return {
        ...state,
        pendingSummon: {
          ...ps,
          selectedRetreatIds: newSelectedIds,
          selectedLv: newSelectedLv,
        },
        log: [
          ...state.log,
          `📍 选择撤退 (Lv${cardLv})，已选 Lv${newSelectedLv}/${ps.requiredLv}`,
        ],
      };
    }

    // ===== 已选 Lv 足够，完成号召 =====
    const np = [...state.players] as typeof state.players;
    const npP = { ...np[ps.playerIdx] };
    const newField = { ...npP.field };
    for (const z of ZONE_LIST) newField[z] = [...npP.field[z]];
    let newBase = [...npP.base];
    const newRetreat = [...npP.retreat];
    const retreatedNames: string[] = [];

    // 撤退所有选中的卡牌
    for (const sid of newSelectedIds) {
      const sCard = db.cards.find((c) => c.id === sid);
      retreatedNames.push(sCard?.name || sid);
      if (newBase.includes(sid)) {
        newBase = newBase.filter((id) => id !== sid);
      } else {
        for (const z of ZONE_LIST) {
          if (newField[z].includes(sid)) {
            newField[z] = newField[z].filter((id) => id !== sid);
          }
        }
      }
      newRetreat.push(sid);
    }

    // 从手牌移除号召卡牌
    const hand = [...npP.hand];
    hand.splice(ps.handIndex, 1);

    // 放入目标区域
    if (ps.zone === "base") {
      np[ps.playerIdx] = {
        ...npP,
        hand,
        base: [...newBase, ps.cardId],
        field: newField,
        retreat: newRetreat,
      };
    } else {
      np[ps.playerIdx] = {
        ...npP,
        hand,
        field: { ...newField, [ps.zone]: [...newField[ps.zone], ps.cardId] },
        base: newBase,
        retreat: newRetreat,
      };
    }

    const summonCard = db.cards.find((c) => c.id === ps.cardId);
    const zoneLabel = ps.zone === "base" ? "基地" : ZONE_LABELS[ps.zone];

    let newState: BattleState = {
      ...state,
      players: np,
      pendingSummon: null,
      remainingSummons: state.remainingSummons - 1,
      enteredThisTurn: [...state.enteredThisTurn, ps.cardId],
      log: [
        ...state.log,
        `⚔️ ${npP.name} 号召「${summonCard?.name || "?"}」(Lv${ps.requiredLv}) → ${zoneLabel} (撤退: ${retreatedNames.join(", ")}) [剩余${state.remainingSummons - 1}次]`,
      ],
    };

    // 触发号召进场事件
    newState = triggerEvent(newState, "onCardSummoned", {
      state: newState,
      cardId: ps.cardId,
      playerIdx: ps.playerIdx,
      zone: ps.zone === "base" ? undefined : ps.zone,
    });

    // 触发该卡牌的 onSummon 效果
    if (ps.zone !== "base") {
      newState = triggerEffectsByTiming(newState, ps.cardId, "onSummon", db);
    }

    // Lv4+号召完成后开启应对窗口（仅战区号召）
    if (ps.zone !== "base") {
      newState = {
        ...newState,
        pendingCounter: {
          summoningPlayerIdx: ps.playerIdx,
          summoningCardId: ps.cardId,
          summoningZone: ps.zone,
        },
        counterPassCount: 0,
      };
    }

    return checkpoint(newState);
  }

  /**
   * CANCEL_SUMMON — 取消号召，恢复到选择前状态
   *
   * 卡牌仍在手牌中（未被移除），只需清除 pendingSummon。
   */
  function handleCancelSummon(state: BattleState): BattleState {
    if (!state.pendingSummon) return state;
    return {
      ...state,
      pendingSummon: null,
      log: [...state.log, "❌ 取消号召"],
    };
  }

  /**
   * MOVE_CHARACTER — 战区移动
   * 验证阶段（ACTION 或 CONFLICT-adjust）；冲突阶段检查 conflictMovesUsed<4；目标区域空；移动卡牌；冲突阶段 conflictMovesUsed+1
   */
  function handleMoveCharacter(
    state: BattleState,
    playerIdx: number,
    fromZone: Zone,
    cardId: string,
    toZone: Zone
  ): BattleState {
    if (fromZone === toZone) return state;

    const isInAction =
      state.turnPhase === "ACTION" && state.activePlayerIndex === playerIdx;
    const isInConflictAdjust =
      state.turnPhase === "CONFLICT" &&
      state.conflictSubPhase === "adjust" &&
      state.activePlayerIndex === playerIdx;
    if (!isInAction && !isInConflictAdjust) return state;

    if (isInConflictAdjust && state.conflictMovesUsed >= 4) return state;

    // 检查目标区域是否已有角色（每区域限1张）
    if (state.players[playerIdx].field[toZone].length >= 1) return state;

    const np = [...state.players] as typeof state.players;
    const p = { ...np[playerIdx] };
    const fromArr = p.field[fromZone].filter((id) => id !== cardId);
    const toArr = [...p.field[toZone], cardId];
    np[playerIdx] = {
      ...p,
      field: { ...p.field, [fromZone]: fromArr, [toZone]: toArr },
    };
    const card = db.cards.find((c) => c.id === cardId);

    let newState: BattleState = {
      ...state,
      players: np,
      log: [
        ...state.log,
        `🔄 ${p.name} 「${card?.name || "?"}」从${ZONE_LABELS[fromZone]}移至${ZONE_LABELS[toZone]}`,
      ],
    };

    // 冲突阶段调整：增加已用次数
    if (isInConflictAdjust) {
      newState = { ...newState, conflictMovesUsed: state.conflictMovesUsed + 1 };
    }

    return checkpoint(newState);
  }

  /**
   * MOVE_CARD — 战基移动（战区↔基地）
   *
   * 验证条件：
   * - 活跃玩家在 ACTION 阶段 或 CONFLICT-adjust 阶段
   * - 卡牌非本回合进场（不在 enteredThisTurn 中）
   * - 目标位置有空位（战区≤1张，基地≤6张）
   * - 不能移动到同一位置
   *
   * 冲突阶段调整：conflictMovesUsed+1（上限4次）
   */
  function handleMoveCard(
    state: BattleState,
    playerIdx: number,
    fromLoc: Zone | "base",
    cardId: string,
    toLoc: Zone | "base"
  ): BattleState {
    if (fromLoc === toLoc) return state;

    const isInAction =
      state.turnPhase === "ACTION" && state.activePlayerIndex === playerIdx;
    const isInConflictAdjust =
      state.turnPhase === "CONFLICT" &&
      state.conflictSubPhase === "adjust" &&
      state.activePlayerIndex === playerIdx;
    if (!isInAction && !isInConflictAdjust) return state;

    if (isInConflictAdjust && state.conflictMovesUsed >= 4) return state;

    // 检查卡牌是否本回合进场
    if (state.enteredThisTurn.includes(cardId)) return state;

    const p = state.players[playerIdx];

    // 验证卡牌在来源位置
    if (fromLoc === "base") {
      if (!p.base.includes(cardId)) return state;
    } else {
      if (!p.field[fromLoc].includes(cardId)) return state;
    }

    // 验证目标位置有空位
    if (toLoc === "base") {
      if (p.base.length >= 6) return state;
    } else {
      if (p.field[toLoc].length >= 1) return state;
    }

    const np = [...state.players] as typeof state.players;
    const npP = { ...np[playerIdx] };
    let newBase = [...npP.base];
    const newField = { ...npP.field };
    for (const z of ZONE_LIST) newField[z] = [...npP.field[z]];

    // 从来源移除
    if (fromLoc === "base") {
      newBase = newBase.filter((id) => id !== cardId);
    } else {
      newField[fromLoc] = newField[fromLoc].filter((id) => id !== cardId);
    }

    // 添加到目标
    if (toLoc === "base") {
      newBase = [...newBase, cardId];
    } else {
      newField[toLoc] = [...newField[toLoc], cardId];
    }

    np[playerIdx] = { ...npP, base: newBase, field: newField };

    const card = db.cards.find((c) => c.id === cardId);
    const fromLabel = fromLoc === "base" ? "基地" : ZONE_LABELS[fromLoc];
    const toLabel = toLoc === "base" ? "基地" : ZONE_LABELS[toLoc];

    let newState: BattleState = {
      ...state,
      players: np,
      log: [
        ...state.log,
        `🔄 ${npP.name} 「${card?.name || "?"}」从${fromLabel}移至${toLabel}`,
      ],
    };

    // 冲突阶段调整：增加已用次数
    if (isInConflictAdjust) {
      newState = { ...newState, conflictMovesUsed: state.conflictMovesUsed + 1 };
    }

    return checkpoint(newState);
  }

  /**
   * START_ATTACK — 选择攻击者
   * 验证活跃玩家+CONFLICT-attack+currentAttackZone===zone+未攻击过；设置 pendingAttack
   */
  function handleStartAttack(
    state: BattleState,
    playerIdx: number,
    zone: Zone,
    cardId: string
  ): BattleState {
    if (state.activePlayerIndex !== playerIdx) return state;
    if (state.turnPhase !== "CONFLICT" || state.conflictSubPhase !== "attack") return state;
    // 使用 conflictAttackCount 判断是否可攻击（支持连击：有连击=2次，无=1次）
    const attackCount = state.conflictAttackCount?.[cardId] ?? 0;
    const hasCombo = hasKeyword(state, cardId, "combo", db);
    const maxAttacks = hasCombo ? 2 : 1;
    if (attackCount >= maxAttacks) return state;
    if (!state.currentAttackZone || state.currentAttackZone !== zone) return state;

    return checkpoint({
      ...state,
      pendingAttack: {
        attackerIdx: playerIdx,
        attackerZone: zone,
        attackerCardId: cardId,
      },
    });
  }

  /**
   * CONFIRM_ATTACK — 确认攻击目标，执行战斗判定
   *
   * 读取 pendingAttack；计算战力对比（getCardPower）；
   * 角色对战(大退小/等双退)/直接攻击破绽(rushDeck→timeline)；
   * 标记 conflictAttackedCards；检查区域完成→conflictZonesCompleted；
   * 检查4区完成→END_PHASE；清除 pendingAttack
   */
  function handleConfirmAttack(
    state: BattleState,
    targetPlayerIdx: number,
    targetZone: Zone,
    targetCardId?: string
  ): BattleState {
    if (!state.pendingAttack) return state;

    const attackTarget = state.pendingAttack;

    // 空袭验证：直接攻击破绽（无 targetCardId）且敌方战区有角色时，攻击者须拥有【空袭】
    if (!targetCardId) {
      const oppCharsInZone = state.players[targetPlayerIdx].field[targetZone];
      if (oppCharsInZone.length > 0 && !hasKeyword(state, attackTarget.attackerCardId, "airRaid", db)) {
        return state;
      }
    }

    // 触发攻击事件（在战斗判定前）
    let preState = triggerEvent(state, "onCardAttacked", {
      state,
      cardId: attackTarget.attackerCardId,
      playerIdx: attackTarget.attackerIdx,
      zone: attackTarget.attackerZone,
    });

    // 触发攻击者的 onAttack 效果
    preState = triggerEffectsByTiming(
      preState,
      attackTarget.attackerCardId,
      "onAttack",
      db,
      undefined,
      attackTarget.attackerIdx
    );

    const attCard = db.cards.find((c) => c.id === attackTarget.attackerCardId);
    const attPower = getEffectivePower(preState, attackTarget.attackerCardId, db);

    let logMsg = "";
    let np = [...preState.players] as typeof state.players;

    // 追踪被撤退的卡牌（用于触发撤退事件）— 声明在 if/else 外部以确保作用域覆盖
    const retreatedCards: { cardId: string; playerIdx: number }[] = [];

    if (targetCardId) {
      // === 角色对战 ===
      const defCard = db.cards.find((c) => c.id === targetCardId);
      const defPower = getEffectivePower(preState, targetCardId, db);
      const defPlayer = { ...np[targetPlayerIdx] };
      const defField = { ...defPlayer.field };
      const attPlayer = { ...np[attackTarget.attackerIdx] };
      const attField = { ...attPlayer.field };

      if (attPower > defPower) {
        // 攻击者胜利 → 防守者撤退
        defField[targetZone] = defField[targetZone].filter((id) => id !== targetCardId);
        np[targetPlayerIdx] = {
          ...defPlayer,
          field: defField,
          retreat: [...defPlayer.retreat, targetCardId],
        };
        retreatedCards.push({ cardId: targetCardId, playerIdx: targetPlayerIdx });
        logMsg = `⚔️「${attCard?.name}」(${attPower}) 击败「${defCard?.name}」(${defPower}) → 防守者撤退`;

        // 强袭判定：攻击者拥有【强袭】时，对方冲击卡组顶1张入时间线
        if (hasKeyword(preState, attackTarget.attackerCardId, "assault", db)) {
          const defP2 = { ...np[targetPlayerIdx] };
          const rushDeck2 = [...defP2.rushDeck];
          if (rushDeck2.length > 0) {
            const rushCard = rushDeck2.shift()!;
            np[targetPlayerIdx] = {
              ...defP2,
              rushDeck: rushDeck2,
              timeline: [...defP2.timeline, rushCard],
            };
            logMsg += ` | 💥强袭! 冲击卡入${defPlayer.name}的时间线 (${defP2.timeline.length + 1}/9)`;
          }
        }
      } else if (attPower < defPower) {
        // 防守者胜利 → 攻击者撤退
        attField[attackTarget.attackerZone] = attField[attackTarget.attackerZone].filter(
          (id) => id !== attackTarget.attackerCardId
        );
        np[attackTarget.attackerIdx] = {
          ...attPlayer,
          field: attField,
          retreat: [...attPlayer.retreat, attackTarget.attackerCardId],
        };
        retreatedCards.push({ cardId: attackTarget.attackerCardId, playerIdx: attackTarget.attackerIdx });
        logMsg = `⚔️「${attCard?.name}」(${attPower}) 被「${defCard?.name}」(${defPower}) 击退 → 攻击者撤退`;
      } else {
        // 平局 → 双双撤退（除非拥有【反相杀】antiMutualKill）
        const attAntiMutualKill = hasKeyword(preState, attackTarget.attackerCardId, "antiMutualKill", db);
        const defAntiMutualKill = hasKeyword(preState, targetCardId, "antiMutualKill", db);

        if (!attAntiMutualKill) {
          attField[attackTarget.attackerZone] = attField[attackTarget.attackerZone].filter(
            (id) => id !== attackTarget.attackerCardId
          );
          np[attackTarget.attackerIdx] = {
            ...attPlayer,
            field: attField,
            retreat: [...attPlayer.retreat, attackTarget.attackerCardId],
          };
          retreatedCards.push({ cardId: attackTarget.attackerCardId, playerIdx: attackTarget.attackerIdx });
        }
        if (!defAntiMutualKill) {
          defField[targetZone] = defField[targetZone].filter((id) => id !== targetCardId);
          np[targetPlayerIdx] = {
            ...defPlayer,
            field: defField,
            retreat: [...defPlayer.retreat, targetCardId],
          };
          retreatedCards.push({ cardId: targetCardId, playerIdx: targetPlayerIdx });
        }

        const immuneParts: string[] = [];
        if (attAntiMutualKill) immuneParts.push(`「${attCard?.name}」反相杀免疫`);
        if (defAntiMutualKill) immuneParts.push(`「${defCard?.name}」反相杀免疫`);
        logMsg = `⚔️「${attCard?.name}」(${attPower}) vs「${defCard?.name}」(${defPower}) → 平局！${immuneParts.length > 0 ? immuneParts.join("，") : "双双撤退"}`;
      }
    } else {
      // === 直接攻击破绽 → 冲击卡入时间线 ===
      const defPlayer = { ...np[targetPlayerIdx] };
      const rushDeck = [...defPlayer.rushDeck];
      if (rushDeck.length > 0) {
        const rushCard = rushDeck.shift()!;
        defPlayer.rushDeck = rushDeck;
        defPlayer.timeline = [...defPlayer.timeline, rushCard];
        np[targetPlayerIdx] = defPlayer;
        logMsg = `💥「${attCard?.name}」直接攻击${ZONE_LABELS[targetZone]}破绽! 冲击卡入${defPlayer.name}的时间线 (${defPlayer.timeline.length}/9)`;
      } else {
        logMsg = `💥「${attCard?.name}」直接攻击破绽! 但对方冲击卡组已空`;
      }
    }

    // 标记攻击者已攻击（基于 preState 以保留触发器产生的状态变更）
    const newAttacked = [...preState.conflictAttackedCards, attackTarget.attackerCardId];

    // 连击追踪：递增该卡本冲突阶段的攻击次数
    const newConflictAttackCount: Record<string, number> = {
      ...(preState.conflictAttackCount ?? {}),
      [attackTarget.attackerCardId]:
        (preState.conflictAttackCount?.[attackTarget.attackerCardId] ?? 0) + 1,
    };

    // 检查攻击者所在区域是否全部攻击完毕（使用 conflictAttackCount + 连击判断）
    const attackerZone = attackTarget.attackerZone;
    const zoneChars = np[attackTarget.attackerIdx].field[attackerZone];
    const allAttacked = zoneChars.every((id) => {
      const count = newConflictAttackCount[id] ?? 0;
      const combo = hasKeyword(preState, id, "combo", db);
      const maxAttacks = combo ? 2 : 1;
      return count >= maxAttacks;
    });

    let newCompleted = [...preState.conflictZonesCompleted];
    let zoneAutoCompleted = false;
    if (allAttacked && !newCompleted.includes(attackerZone)) {
      newCompleted.push(attackerZone);
      zoneAutoCompleted = true;
    }

    let newState: BattleState = {
      ...preState,
      players: np,
      conflictAttackedCards: newAttacked,
      conflictAttackCount: newConflictAttackCount,
      conflictZonesCompleted: newCompleted,
      pendingAttack: null,
      log: [...preState.log, logMsg],
    };

    // 区域完成时清除当前攻击区域
    if (zoneAutoCompleted) {
      newState = { ...newState, currentAttackZone: null };
    }

    // 所有4个区域完成 → 进入结束阶段
    if (newCompleted.length >= 4) {
      newState = {
        ...newState,
        turnPhase: "END_PHASE",
        currentAttackZone: null,
        log: [...newState.log, "✅ 冲突阶段结束，所有区域处理完毕"],
      };
    }

    // ===== 触发撤退事件 =====
    // 对每张被撤退的卡牌：触发 onCardRetreated 事件 → 该卡的 onRetreat 效果 → 友方的 onAllyDefeated 效果
    for (const { cardId, playerIdx } of retreatedCards) {
      // 触发 onCardRetreated 事件（供 EventListener 使用）
      newState = triggerEvent(newState, "onCardRetreated", {
        state: newState,
        cardId,
        playerIdx,
      });

      // 触发被撤退卡牌自身的 onRetreat 效果
      newState = triggerEffectsByTiming(newState, cardId, "onRetreat", db);

      // 触发友方角色的 onAllyDefeated 效果
      newState = triggerAllyDefeatedEffects(newState, cardId, playerIdx, db);
    }

    return checkpoint(newState);
  }

  /**
   * SKIP_ZONE — 跳过某区域
   * 加入 conflictZonesCompleted；若4区全完成→END_PHASE
   */
  function handleSkipZone(state: BattleState, zone: Zone): BattleState {
    if (state.conflictZonesCompleted.includes(zone)) return state;

    const completed = [...state.conflictZonesCompleted, zone];
    const allDone = completed.length >= 4;

    let newState: BattleState = {
      ...state,
      conflictZonesCompleted: completed,
      currentAttackZone: null,
      pendingAttack: null,
      log: [...state.log, `⏭️ 跳过${ZONE_LABELS[zone]}区`],
    };

    if (allDone) {
      newState = {
        ...newState,
        turnPhase: "END_PHASE",
        log: [...newState.log, "✅ 冲突阶段结束，所有区域处理完毕"],
      };
    }

    return checkpoint(newState);
  }

  // ============================================================
  // T02 新增 Handler 函数
  // ============================================================

  /**
   * MULLIGAN_SELECT — 选择要调整的手牌
   * 更新 mulliganSelected 字段，供后续 MULLIGAN_CONFIRM 使用。
   */
  function handleMulliganSelect(
    state: BattleState,
    _playerIdx: number,
    cardIds: string[]
  ): BattleState {
    return checkpoint({
      ...state,
      mulliganSelected: cardIds,
    });
  }

  /**
   * MULLIGAN_CONFIRM — 确认手牌调整
   *
   * 执行流程：
   * 1. 从手牌移除 mulliganSelected 中的卡牌
   * 2. 将 shuffledDeck（UI 层已洗混，含放回的卡）设为新卡组
   * 3. 从新卡组顶抽等量卡牌到手牌
   * 4. 推进 setupPhase（P1→P2→DONE）
   * 5. DONE 时设 isSetup=false, turnPhase=TURN_START
   * 6. 清空 mulliganSelected
   */
  function handleMulliganConfirm(
    state: BattleState,
    playerIdx: number,
    shuffledDeck: string[]
  ): BattleState {
    // 验证：在开局调度阶段
    if (!state.isSetup) return state;
    if (state.setupPhase !== "MULLIGAN_P1" && state.setupPhase !== "MULLIGAN_P2") return state;

    const selectedIds = state.mulliganSelected ?? [];
    const p = state.players[playerIdx];

    // 从手牌移除选中的卡牌
    const newHand = p.hand.filter((id) => !selectedIds.includes(id));

    // 设为新卡组（UI 层已洗混，含放回的卡牌）
    const newDeck = [...shuffledDeck];

    // 从卡组顶抽等量牌
    const drawCount = Math.min(selectedIds.length, newDeck.length);
    const drawn = newDeck.splice(0, drawCount);
    const finalHand = [...newHand, ...drawn];

    const np = [...state.players] as typeof state.players;
    np[playerIdx] = { ...p, hand: finalHand, deck: newDeck };

    // 推进 setupPhase
    let newSetupPhase: SetupPhase;
    let newIsSetup: boolean = state.isSetup;
    let newTurnPhase = state.turnPhase;

    if (state.setupPhase === "MULLIGAN_P1") {
      newSetupPhase = "MULLIGAN_P2";
    } else {
      newSetupPhase = "DONE";
      newIsSetup = false;
      newTurnPhase = "TURN_START";
    }

    const newState: BattleState = {
      ...state,
      players: np,
      setupPhase: newSetupPhase,
      isSetup: newIsSetup,
      turnPhase: newTurnPhase,
      mulliganSelected: [],
      log: [
        ...state.log,
        `🔄 ${p.name} 调整手牌${selectedIds.length > 0 ? ` (放回${selectedIds.length}张, 抽${drawCount}张)` : " (不调整)"}`,
      ],
    };

    return checkpoint(newState);
  }

  /**
   * TRIGGER_COUNTER — 触发应对
   *
   * 玩家使用手牌中拥有【应对】能力的角色进行号召（作为应对方式的号召）。
   * 验证 counterUsedThisTurn → 号召到场上 → 标记已使用 → counterPassCount=0
   */
  function handleTriggerCounter(
    state: BattleState,
    playerIdx: number,
    cardId: string,
    handIndex: number
  ): BattleState {
    // 验证：应对窗口开启
    if (!state.pendingCounter) return state;

    // 验证：本回合未使用应对
    const counterUsed = state.counterUsedThisTurn?.[playerIdx] ?? false;
    if (counterUsed) return state;

    // 验证：卡牌在手牌中
    const p = state.players[playerIdx];
    if (!p.hand.includes(cardId)) return state;

    // 验证：卡牌拥有【应对】能力
    const card = db.cards.find((c) => c.id === cardId);
    if (!card) return state;
    const cardEffects = getEffectsByCardNo(card.card_no);
    const hasCounter = cardEffects.some(
      (e) => e.category === "counter" || (e.keywords?.includes("counter") ?? false)
    );
    if (!hasCounter) return state;

    // 查找可用战区（第一个空位）
    let targetZone: Zone | null = null;
    for (const z of ZONE_LIST) {
      if (p.field[z].length === 0) {
        targetZone = z;
        break;
      }
    }
    if (!targetZone) return state; // 无可用战区

    // 号召：从手牌移除 → 放入战区
    const np = [...state.players] as typeof state.players;
    const npP = { ...p };
    const hand = [...npP.hand];
    hand.splice(handIndex, 1);
    np[playerIdx] = {
      ...npP,
      hand,
      field: { ...npP.field, [targetZone]: [...npP.field[targetZone], cardId] },
    };

    // 标记已使用应对 + 重置 passCount
    const newCounterUsed = [...(state.counterUsedThisTurn ?? [false, false])] as [boolean, boolean];
    newCounterUsed[playerIdx] = true;

    let newState: BattleState = {
      ...state,
      players: np,
      counterUsedThisTurn: newCounterUsed,
      counterPassCount: 0,
      enteredThisTurn: [...state.enteredThisTurn, cardId],
      log: [
        ...state.log,
        `🛡️ ${p.name} 触发应对，号召「${card.name}」→ ${ZONE_LABELS[targetZone]}`,
      ],
    };

    // 触发号召进场事件
    newState = triggerEvent(newState, "onCardSummoned", {
      state: newState,
      cardId,
      playerIdx,
      zone: targetZone,
    });

    // 触发该卡牌的 onSummon 效果
    newState = triggerEffectsByTiming(newState, cardId, "onSummon", db);

    return checkpoint(newState);
  }

  /**
   * RESOLVE_COUNTER — 使用应对·起动效果
   *
   * 查找场上/手牌中的 isCounterActive 效果 → 检查 condition → 执行 execute → 标记已使用。
   * 用于拦截等应对·起动效果。
   */
  function handleResolveCounter(
    state: BattleState,
    playerIdx: number,
    effectCardId: string,
    effectId?: string
  ): BattleState {
    // 验证：应对窗口开启
    if (!state.pendingCounter) return state;

    // 查找卡牌
    const card = db.cards.find((c) => c.id === effectCardId);
    if (!card) return state;

    // 查找 isCounterActive 效果
    const cardEffects = getEffectsByCardNo(card.card_no);
    let counterActiveEffects = cardEffects.filter((e) => e.isCounterActive === true);

    // 若指定 effectId 则进一步过滤
    if (effectId) {
      counterActiveEffects = counterActiveEffects.filter((e) => e.id === effectId);
    }

    if (counterActiveEffects.length === 0) return state;

    // 查找卡牌所属玩家
    const ownerIdx = findCardOwner(state, effectCardId);
    if (ownerIdx < 0) return state;

    let newState = state;

    for (const effect of counterActiveEffects) {
      // 检查"回合1次"限制
      const usedKey = `${card.card_no}-${effect.id}`;
      if (effect.once && (newState.effectUsedThisTurn?.includes(usedKey) ?? false)) {
        continue;
      }

      const ctx: EffectContext = {
        state: newState,
        cardId: effectCardId,
        playerIdx: ownerIdx,
        db,
      };

      // 检查 condition
      if (effect.condition && !effect.condition(ctx)) continue;

      // 检查 cost
      if (effect.cost && !effect.cost(ctx)) continue;

      // 执行效果
      newState = effect.execute({ ...ctx, state: newState });

      // 标记"回合1次"
      if (effect.once) {
        newState = {
          ...newState,
          effectUsedThisTurn: [...(newState.effectUsedThisTurn ?? []), usedKey],
        };
      }

      // 追踪已起动效果
      newState = {
        ...newState,
        activatedEffectsThisTurn: [...(newState.activatedEffectsThisTurn ?? []), usedKey],
      };
    }

    return checkpoint(newState);
  }

  /**
   * PASS_COUNTER — 选择不行动
   *
   * counterPassCount += 1；若 >= 2（双方连续不行动）则关闭应对窗口。
   */
  function handlePassCounter(
    state: BattleState,
    playerIdx: number
  ): BattleState {
    // 验证：应对窗口开启
    if (!state.pendingCounter) return state;

    const newPassCount = (state.counterPassCount ?? 0) + 1;
    const shouldClose = newPassCount >= 2;

    return checkpoint({
      ...state,
      counterPassCount: newPassCount,
      pendingCounter: shouldClose ? null : state.pendingCounter,
      log: [
        ...state.log,
        `⏭️ ${state.players[playerIdx].name} 选择不行动 (连续${newPassCount}/2)${shouldClose ? " → 应对窗口关闭" : ""}`,
      ],
    });
  }

  /**
   * ACTIVATE_EFFECT — 起动效果
   *
   * 验证活跃玩家+ACTION阶段 → 查找卡牌 active 效果 → 检查 activeSource 与卡牌区域匹配
   * → 检查 effectUsedThisTurn（回合1次）→ 检查 condition+cost → 执行 execute
   * → 若 faceDownAfterActive 则盖伏 → 若 once 则 effectUsedThisTurn.push
   */
  function handleActivateEffect(
    state: BattleState,
    playerIdx: number,
    cardId: string,
    effectId?: string
  ): BattleState {
    // 验证：活跃玩家 + ACTION 阶段
    if (state.activePlayerIndex !== playerIdx) return state;
    if (state.turnPhase !== "ACTION") return state;

    // 查找卡牌
    const card = db.cards.find((c) => c.id === cardId);
    if (!card) return state;

    // 查找 active 类型效果（含 isCounterActive — Q4 修正：应对·起动效果在行动阶段也可作为普通起动效果使用）
    const cardEffects = getEffectsByCardNo(card.card_no);
    let activeEffects = cardEffects.filter(e => e.category === "active" || e.isCounterActive === true);

    // 若指定 effectId 则进一步过滤
    if (effectId) {
      activeEffects = activeEffects.filter((e) => e.id === effectId);
    }

    if (activeEffects.length === 0) return state;

    // 验证卡牌属于该玩家
    const ownerIdx = findCardOwner(state, cardId);
    if (ownerIdx < 0 || ownerIdx !== playerIdx) return state;

    // 确定卡牌当前所在区域
    const p = state.players[playerIdx];
    let cardZone: "hand" | "base" | "field" | null = null;
    if (p.hand.includes(cardId)) cardZone = "hand";
    else if (p.base.includes(cardId)) cardZone = "base";
    else {
      for (const z of ZONE_LIST) {
        if (p.field[z].includes(cardId)) {
          cardZone = "field";
          break;
        }
      }
    }
    if (!cardZone) return state;

    let newState = state;

    for (const effect of activeEffects) {
      // 检查 activeSource 与卡牌区域匹配
      if (effect.activeSource && effect.activeSource !== cardZone) continue;

      // 检查"回合1次"限制
      const usedKey = `${card.card_no}-${effect.id}`;
      if (effect.once && (newState.effectUsedThisTurn?.includes(usedKey) ?? false)) {
        continue;
      }

      const ctx: EffectContext = {
        state: newState,
        cardId,
        playerIdx,
        db,
      };

      // 检查 condition
      if (effect.condition && !effect.condition(ctx)) continue;

      // 检查 cost
      if (effect.cost && !effect.cost(ctx)) continue;

      // 执行效果
      newState = effect.execute({ ...ctx, state: newState });

      // faceDownAfterActive：将卡牌从场上盖伏至基地
      if (effect.faceDownAfterActive) {
        const np = [...newState.players] as typeof newState.players;
        const npP = { ...np[playerIdx] };
        const newField = { ...npP.field };
        for (const z of ZONE_LIST) newField[z] = [...npP.field[z]];
        let movedToBase = false;
        for (const z of ZONE_LIST) {
          if (newField[z].includes(cardId)) {
            newField[z] = newField[z].filter((id) => id !== cardId);
            np[playerIdx] = { ...npP, field: newField, base: [...npP.base, cardId] };
            newState = { ...newState, players: np };
            movedToBase = true;
            break;
          }
        }
        void movedToBase;
      }

      // 标记"回合1次"
      if (effect.once) {
        newState = {
          ...newState,
          effectUsedThisTurn: [...(newState.effectUsedThisTurn ?? []), usedKey],
        };
      }

      // 追踪已起动效果
      newState = {
        ...newState,
        activatedEffectsThisTurn: [...(newState.activatedEffectsThisTurn ?? []), usedKey],
      };
    }

    return checkpoint(newState);
  }

  /**
   * SELECT_TARGETS — 玩家确认目标选择后，重新调用效果 execute
   *
   * 从 pendingTargetSelection 中获取效果信息，将选中的目标通过 ctx.targets 传入，
   * 重新调用 execute 执行效果主体。
   */
  function handleSelectTargets(
    state: BattleState,
    playerIdx: number,
    targetCardIds: string[]
  ): BattleState {
    const pts = state.pendingTargetSelection;
    if (!pts) return state;

    // 查找效果
    const card = db.cards.find((c) => c.id === pts.effectCardId);
    if (!card) return state;

    const cardEffects = getEffectsByCardNo(card.card_no);
    const effect = cardEffects.find((e) => e.id === pts.effectId);
    if (!effect) return state;

    // 查找卡牌所属玩家
    const ownerIdx = findCardOwner(state, pts.effectCardId);
    if (ownerIdx < 0) return state;

    const ctx: EffectContext = {
      state,
      cardId: pts.effectCardId,
      playerIdx: ownerIdx,
      db,
      targets: {
        cardId: targetCardIds[0],
        cardIds: targetCardIds,
      },
    };

    // 执行效果
    let newState = effect.execute(ctx);

    // 清除 pendingTargetSelection
    newState = {
      ...newState,
      pendingTargetSelection: null,
    };

    // 标记"回合1次"
    if (effect.once) {
      const usedKey = `${card.card_no}-${effect.id}`;
      newState = {
        ...newState,
        effectUsedThisTurn: [...(newState.effectUsedThisTurn ?? []), usedKey],
        activatedEffectsThisTurn: [...(newState.activatedEffectsThisTurn ?? []), usedKey],
      };
    }

    return checkpoint(newState);
  }

  /**
   * CANCEL_TARGET_SELECTION — 取消目标选择
   *
   * 清除 pendingTargetSelection，不执行效果。
   */
  function handleCancelTargetSelection(
    state: BattleState,
    _playerIdx: number
  ): BattleState {
    if (!state.pendingTargetSelection) return state;
    return checkpoint({
      ...state,
      pendingTargetSelection: null,
      log: [...state.log, "❌ 取消目标选择"],
    });
  }
}
